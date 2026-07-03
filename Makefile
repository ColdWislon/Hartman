.PHONY: demo demo-quick up down ingest ingest-sample ingest-demo seed-mailmap logs clean api-dev web-dev

# Stand up the whole stack and load the LARGE realistic demo dataset
# (6 repos, ~2.4k commits over 18 months, 3 trackers, hundreds of artifacts).
demo: up
	docker compose run --rm ingest ingest-all --seed-demo
	@echo ""
	@echo "  Web UI : http://localhost:8080"
	@echo "  API    : http://localhost:8000/api/repos"
	@echo ""

# Same, but the small quick sample dataset (2 repos, ~120 commits).
demo-quick: up
	docker compose run --rm ingest ingest-all --seed-sample
	@echo "  Web UI : http://localhost:8080"

up:
	docker compose up -d --build db api web

down:
	docker compose down

# Real ingestion against a live Tuleap (needs TULEAP_ACCESS_KEY in the env).
ingest:
	docker compose run --rm ingest ingest-all

ingest-sample:
	docker compose run --rm ingest ingest-all --seed-sample

# Large realistic offline dataset. Override scale, e.g. `make ingest-demo SCALE=2`.
SCALE ?= 1
ingest-demo:
	docker compose run --rm ingest ingest-all --seed-demo --scale $(SCALE)

seed-mailmap:
	docker compose run --rm ingest seed-mailmap

logs:
	docker compose logs -f api web

clean:
	docker compose down -v

# --- local (non-docker) dev helpers ---
api-dev:
	cd . && uvicorn api.main:app --reload --port 8000

web-dev:
	cd web && npm install && npm run dev
