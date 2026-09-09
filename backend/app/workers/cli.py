"""Operational commands.

    python -m app.workers.cli backfill [days]   seed history (FIRMS caps at 10)
    python -m app.workers.cli ingest            one ingest pass
    python -m app.workers.cli analyse [limit]   enrich pending events
    python -m app.workers.cli status            recent ingest history

Useful when the API is not running, and for the cold start: recurrence only
becomes a usable signal once history exists.
"""

import asyncio
import json
import logging
import sys

from app.config import settings
from app.database.connection import dispose_engine
from app.workers.jobs import analysis_job, backfill, ingest_job, last_ingest_run


async def _main(argv: list[str]) -> int:
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )
    # The FIRMS MAP_KEY is a URL path segment and httpx logs full URLs at INFO,
    # which would write the credential into any captured output.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    command = argv[0] if argv else "status"
    argument = argv[1] if len(argv) > 1 else None

    try:
        if command == "backfill":
            print(json.dumps(await backfill(int(argument or 10)), indent=2, default=str))
        elif command == "ingest":
            print(json.dumps(await ingest_job(int(argument) if argument else None), indent=2, default=str))
        elif command == "analyse":
            print(json.dumps(await analysis_job(int(argument) if argument else None), indent=2, default=str))
        elif command == "status":
            run = await last_ingest_run()
            if run is None:
                print("No ingest has run yet.")
            else:
                print(
                    json.dumps(
                        {
                            "started_at": str(run.started_at),
                            "finished_at": str(run.finished_at),
                            "ok": run.ok,
                            "detections_fetched": run.detections_fetched,
                            "detections_inserted": run.detections_inserted,
                            "events_created": run.events_created,
                            "detail": run.detail,
                        },
                        indent=2,
                    )
                )
        else:
            print(__doc__)
            return 2
        return 0
    finally:
        await dispose_engine()


if __name__ == "__main__":
    sys.exit(asyncio.run(_main(sys.argv[1:])))
