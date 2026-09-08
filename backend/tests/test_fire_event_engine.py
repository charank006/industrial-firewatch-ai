"""Fire event engine tests (spec section 7).

These run against a real PostGIS database. The engine is essentially spatial
SQL - ST_DWithin on ::geography, KNN ordering, an FRP-weighted centroid - so
mocking the database would test nothing that matters.
"""

import datetime

import pytest
from sqlalchemy import func, select, text

from app.config import settings
from app.models.models import FireDetection, FireEvent, detection_identity
from app.seed_data import FACILITIES_DB
from app.services.fire_event_service import (
    mark_stale_events_contained,
    process_detections,
    seed_facilities,
)
from tests.conftest import make_detection

BASE = datetime.datetime(2026, 9, 8, 8, 0, tzinfo=datetime.timezone.utc)
SURAT = (21.1738, 72.8345)


async def count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


class TestDetectionDeduplication:
    """FIRMS re-serves identical rows on every overlapping poll - roughly 96
    times a day at a 15 minute cadence. Without ON CONFLICT DO NOTHING,
    detection_count and recurrence_count inflate by two orders of magnitude
    and the Routine Flare rule fires on everything."""

    async def test_identical_detection_inserted_once(self, db):
        detection = make_detection(*SURAT, BASE, frp=100.0)
        first = await process_detections(db, [detection])
        second = await process_detections(db, [detection])

        assert first.detections_inserted == 1
        assert second.detections_inserted == 0
        assert await count(db, FireDetection) == 1

    async def test_repeated_ingest_creates_no_extra_events(self, db):
        detections = [
            make_detection(*SURAT, BASE, frp=100.0),
            make_detection(21.1740, 72.8350, BASE + datetime.timedelta(hours=2), frp=110.0),
        ]
        first = await process_detections(db, detections)
        for _ in range(3):
            repeat = await process_detections(db, detections)
            assert repeat.detections_inserted == 0
            assert repeat.events_created == 0

        assert first.events_created == 1
        assert await count(db, FireEvent) == 1
        assert await count(db, FireDetection) == 2

    async def test_same_pixel_from_a_different_satellite_is_kept(self, db):
        """Two platforms seeing one fire are two genuine observations."""
        await process_detections(
            db,
            [
                make_detection(*SURAT, BASE, satellite="N"),
                make_detection(*SURAT, BASE, satellite="N20"),
            ],
        )
        assert await count(db, FireDetection) == 2

    async def test_identity_hash_is_stable_and_position_sensitive(self):
        a = detection_identity("N", "VIIRS", BASE, 21.1738, 72.8345)
        assert a == detection_identity("N", "VIIRS", BASE, 21.1738, 72.8345)
        assert a != detection_identity("N", "VIIRS", BASE, 21.1739, 72.8345)


class TestEventLinking:
    async def test_nearby_and_recent_detections_join_one_event(self, db):
        """~200m apart, 3h apart - clearly the same fire."""
        result = await process_detections(
            db,
            [
                make_detection(*SURAT, BASE, frp=100.0),
                make_detection(21.1755, 72.8345, BASE + datetime.timedelta(hours=3), frp=120.0),
            ],
        )
        assert result.events_created == 1
        assert await count(db, FireEvent) == 1

    async def test_distant_detections_stay_separate(self, db):
        """Surat and Vapi are ~90km apart."""
        result = await process_detections(
            db,
            [
                make_detection(*SURAT, BASE),
                make_detection(20.3755, 72.9080, BASE + datetime.timedelta(hours=1)),
            ],
        )
        assert result.events_created == 2

    async def test_detections_outside_the_time_window_stay_separate(self, db):
        """Same spot, but 40h apart - a field burnt today and the same field
        burnt two days later are different events."""
        result = await process_detections(
            db,
            [
                make_detection(*SURAT, BASE),
                make_detection(*SURAT, BASE + datetime.timedelta(hours=40), satellite="N20"),
            ],
        )
        assert result.events_created == 2

    async def test_radius_is_metres_not_degrees(self, db):
        """ST_DWithin on raw SRID-4326 geometry treats the radius as degrees,
        ~111x too large, which would weld unrelated fires together. A point
        0.05 deg away (~5.2km) must NOT link at a 1km radius."""
        assert settings.EVENT_LINK_RADIUS_M == 1000.0
        result = await process_detections(
            db,
            [
                make_detection(*SURAT, BASE),
                make_detection(21.1738 + 0.05, 72.8345, BASE + datetime.timedelta(hours=1)),
            ],
        )
        assert result.events_created == 2

    async def test_links_to_the_nearest_candidate_not_the_first(self, db):
        """Two active events in range; the detection must join the closer one."""
        await process_detections(db, [make_detection(21.1700, 72.8345, BASE)])
        await process_detections(
            db, [make_detection(21.1900, 72.8345, BASE, satellite="N20")]
        )
        assert await count(db, FireEvent) == 2

        # 21.1890 is ~110m from the second event, ~2.1km from the first.
        await process_detections(
            db,
            [
                make_detection(
                    21.1890, 72.8345, BASE + datetime.timedelta(hours=1), satellite="N21"
                )
            ],
        )
        joined = (
            await db.execute(
                select(FireDetection.fire_event_id).where(FireDetection.satellite == "N21")
            )
        ).scalar_one()
        nearest = (
            await db.execute(
                select(FireEvent.id).where(FireEvent.latitude > 21.18).limit(1)
            )
        ).scalar_one()
        assert joined == nearest


class TestChainingGuards:
    """A naive 'within 1km of last_detected' rule lets a spreading front walk
    an event across a district one link at a time, forever."""

    async def test_a_creeping_front_is_split_once_it_exceeds_max_extent(self, db):
        """Steps of ~800m stay inside the link radius at every hop, so only the
        extent guard can stop the chain."""
        step = 0.0072  # ~800m in latitude
        detections = [
            make_detection(
                21.0 + step * i,
                72.8,
                BASE + datetime.timedelta(hours=i),
                satellite=f"S{i}",
            )
            for i in range(20)
        ]
        await process_detections(db, detections)

        events = list((await db.execute(select(FireEvent))).scalars())
        assert len(events) > 1, "extent guard did not fire - the event chained across the region"

        for event in events:
            spread_m = (
                await db.execute(
                    text(
                        """
                        SELECT COALESCE(MAX(ST_Distance(
                            d.geometry::geography,
                            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)), 0)
                        FROM fire_detections d WHERE d.fire_event_id = :eid
                        """
                    ),
                    {"lon": event.longitude, "lat": event.latitude, "eid": event.id},
                )
            ).scalar_one()
            assert spread_m <= settings.MAX_EVENT_EXTENT_KM * 1000 * 1.5

    async def test_split_event_records_its_parent(self, db):
        step = 0.0072
        await process_detections(
            db,
            [
                make_detection(21.0 + step * i, 72.8, BASE + datetime.timedelta(hours=i), satellite=f"S{i}")
                for i in range(20)
            ],
        )
        children = list(
            (await db.execute(select(FireEvent).where(FireEvent.parent_event_id.isnot(None)))).scalars()
        )
        assert children, "lineage was lost when the chain was split"
        assert all(c.parent_event_id is not None for c in children)

    async def test_duration_guard_caps_an_eternal_event(self, db):
        """Same pixel re-detected every 8h for 15 days: inside the link window
        at every step, so only the duration guard can close it."""
        detections = [
            make_detection(*SURAT, BASE + datetime.timedelta(hours=8 * i), satellite=f"S{i}")
            for i in range(45)
        ]
        await process_detections(db, detections)

        events = list((await db.execute(select(FireEvent))).scalars())
        assert len(events) > 1
        for event in events:
            duration = event.last_detected - event.first_detected
            assert duration <= datetime.timedelta(
                hours=settings.MAX_EVENT_DURATION_HOURS + 24
            )


class TestEventAggregates:
    async def test_frp_statistics(self, db):
        await process_detections(
            db,
            [
                make_detection(*SURAT, BASE, frp=10.0),
                make_detection(21.1740, 72.8346, BASE + datetime.timedelta(hours=1), frp=200.0),
                make_detection(21.1742, 72.8347, BASE + datetime.timedelta(hours=2), frp=90.0),
            ],
        )
        event = (await db.execute(select(FireEvent))).scalar_one()
        assert event.detection_count == 3
        assert event.frp_max_mw == 200.0
        assert event.frp_mean_mw == pytest.approx(100.0, abs=0.01)
        assert event.frp_latest_mw == 90.0  # latest by time, not max

    async def test_centroid_is_frp_weighted(self, db):
        """ST_Centroid is unweighted, so a scatter of weak pixels would drag
        the event off the radiatively dominant part of the burn."""
        await process_detections(
            db,
            [
                make_detection(21.1700, 72.8345, BASE, frp=1.0),
                make_detection(21.1780, 72.8345, BASE + datetime.timedelta(hours=1), frp=999.0),
            ],
        )
        event = (await db.execute(select(FireEvent))).scalar_one()
        unweighted_midpoint = (21.1700 + 21.1780) / 2
        assert event.latitude > unweighted_midpoint
        assert event.latitude == pytest.approx(21.1780, abs=0.001)

    async def test_new_evidence_reopens_analysis(self, db):
        await process_detections(db, [make_detection(*SURAT, BASE)])
        event = (await db.execute(select(FireEvent))).scalar_one()
        event.analysis_status = "complete"
        await db.flush()

        await process_detections(
            db,
            [make_detection(21.1740, 72.8346, BASE + datetime.timedelta(hours=1), satellite="N20")],
        )
        await db.refresh(event)
        assert event.analysis_status == "pending"

    async def test_first_and_last_detected_span_the_members(self, db):
        await process_detections(
            db,
            [
                make_detection(*SURAT, BASE, satellite="A"),
                make_detection(21.1740, 72.8346, BASE + datetime.timedelta(hours=5), satellite="B"),
            ],
        )
        event = (await db.execute(select(FireEvent))).scalar_one()
        assert event.first_detected == BASE
        assert event.last_detected == BASE + datetime.timedelta(hours=5)


class TestFacilityRegistry:
    async def test_seed_is_idempotent(self, db):
        assert await seed_facilities(db, FACILITIES_DB) == 6
        await seed_facilities(db, FACILITIES_DB)
        total = (await db.execute(text("SELECT COUNT(*) FROM facilities"))).scalar_one()
        assert total == 6

    async def test_nearest_facility_attached_by_knn(self, db):
        await seed_facilities(db, FACILITIES_DB)
        # FAC-001 Surat Petrochemicals Complex sits at 21.1702, 72.8311.
        await process_detections(db, [make_detection(*SURAT, BASE, frp=180.0)])

        event = (await db.execute(select(FireEvent))).scalar_one()
        assert event.nearest_facility_id == "FAC-001"
        assert 0 < event.nearest_facility_distance_m < 1000

    async def test_a_facility_well_inside_the_cap_is_still_attached(self, db):
        """30.5 km from FAC-006 - far, but plausibly the same neighbourhood."""
        await seed_facilities(db, FACILITIES_DB)
        await process_detections(db, [make_detection(21.47, 72.83, BASE)])
        event = (await db.execute(select(FireEvent))).scalar_one()
        assert event.nearest_facility_id == "FAC-006"
        assert event.nearest_facility_distance_m < settings.FACILITY_ATTACH_MAX_KM * 1000

    async def test_a_fire_beyond_the_cap_is_left_unassigned(self, db):
        """The registry is a curated asset list, so "nearest" is not always
        "near". Naming the closest row regardless of distance reported a fire
        in Telangana as 764 km from a plant in Gujarat, which reads as though
        that plant were implicated."""
        await seed_facilities(db, FACILITIES_DB)
        await process_detections(db, [make_detection(23.5, 70.5, BASE)])  # 123 km out
        event = (await db.execute(select(FireEvent))).scalar_one()
        assert event.nearest_facility_id is None
        assert event.nearest_facility_distance_m is None


class TestContainment:
    async def test_stale_events_are_marked_contained(self, db):
        old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=48)
        await process_detections(db, [make_detection(*SURAT, old)])
        assert await mark_stale_events_contained(db) == 1

        status = (await db.execute(select(FireEvent.status))).scalar_one()
        assert status == "contained"

    async def test_recent_events_stay_active(self, db):
        recent = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)
        await process_detections(db, [make_detection(*SURAT, recent)])
        assert await mark_stale_events_contained(db) == 0
        assert (await db.execute(select(FireEvent.status))).scalar_one() == "active"


class TestOrderingAndReplay:
    async def test_out_of_order_input_yields_the_same_events_as_sorted_input(self, db):
        """Detections are processed in ascending acquisition time so a backfill
        replay is idempotent. Feeding them shuffled must not change the outcome."""
        detections = [
            make_detection(21.1738, 72.8345, BASE + datetime.timedelta(hours=h), satellite=f"S{h}")
            for h in (0, 2, 4, 6)
        ]
        await process_detections(db, list(reversed(detections)))
        events = list((await db.execute(select(FireEvent))).scalars())
        assert len(events) == 1
        assert events[0].detection_count == 4
        assert events[0].first_detected == BASE
