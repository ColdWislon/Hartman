FROM python:3.12-slim

# git is required by the ingestion git lane (mirror clone, log, ls-remote).
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ingest/requirements.txt ./ingest/requirements.txt
RUN pip install --no-cache-dir -r ingest/requirements.txt

COPY ingest/ ./ingest/
COPY db/ ./db/
COPY config.yaml ./config.yaml
COPY .mailmap ./.mailmap

# Default: run the full pipeline. Override the command to pass --seed-sample,
# or to run individual subcommands.
ENTRYPOINT ["python", "-m", "ingest.cli"]
CMD ["ingest-all"]
