.PHONY: demo up down ingest ingest-sample seed-mailmap logs clean api-dev web-dev

# Stand up the whole stack and load the offline demo dataset.
demo: up
	docker compose run --rm ingest ingest-all --seed-sample
	@echo ""
	@echo "  Web UI : http://localhost:8080"
	@echo "  API    : http://localhost:8000/api/repos"
	@echo ""

up:
	docker compose up -d --build db api web

down:
	docker compose down

# Real ingestion against a live Tuleap (needs TULEAP_ACCESS_KEY in the env).
ingest:
	docker compose run --rm ingest ingest-all

ingest-sample:
	docker compose run --rm ingest ingest-all --seed-sample

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
