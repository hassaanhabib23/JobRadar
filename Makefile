COMPOSE     := docker compose
COMPOSE_DEV := docker compose -f docker-compose.yml -f docker-compose.dev.yml

.DEFAULT_GOAL := help
.PHONY: help up dev down clean logs shell psql migrate migrations \
        test test-backend test-frontend lint lint-backend lint-frontend \
        format gen-schema build

help:  ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up:  ## Start the full stack (postgres, redis, web, frontend)
	$(COMPOSE) up --build

dev:  ## Start the stack with hot reload and exposed ports
	$(COMPOSE_DEV) up --build

down:  ## Stop the stack, keeping data
	$(COMPOSE) down

clean:  ## Stop the stack and DESTROY all data (postgres + redis volumes)
	$(COMPOSE) down -v

logs:  ## Tail logs for every service
	$(COMPOSE) logs -f

build:  ## Rebuild images without starting
	$(COMPOSE) build

# Everything below runs against the working tree rather than the baked image, so
# an edit takes effect without a rebuild. The dev compose file supplies the
# ./backend and ./contracts bind mounts.

shell:  ## Django shell inside the web container
	$(COMPOSE_DEV) run --rm web python manage.py shell

psql:  ## psql session against the running database
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-jobradar} -d $${POSTGRES_DB:-jobradar}

migrate:  ## Apply database migrations
	$(COMPOSE_DEV) run --rm web python manage.py migrate

migrations:  ## Generate new migrations
	$(COMPOSE_DEV) run --rm web python manage.py makemigrations

test: test-backend test-frontend  ## Run every test suite

test-backend:  ## pytest against real Postgres (never SQLite)
	$(COMPOSE_DEV) run --rm web pytest

test-frontend:  ## Vitest
	cd frontend && npm run test -- --run

lint: lint-backend lint-frontend  ## Lint both apps

lint-backend:  ## ruff + mypy
	$(COMPOSE_DEV) run --rm web sh -c "ruff check . && ruff format --check . && mypy ."

lint-frontend:  ## eslint + prettier + tsc
	cd frontend && npm run lint && npm run format:check && npm run typecheck

format:  ## Autoformat both apps
	$(COMPOSE_DEV) run --rm web ruff format .
	cd frontend && npm run format

gen-schema:  ## Write contracts/jobradar-v1.json from drf-spectacular
	$(COMPOSE_DEV) run --rm -u root web sh -c "python manage.py spectacular \
	  --file /contracts/jobradar-v1.json --format openapi-json --validate --fail-on-warn \
	  && chown 1000:1000 /contracts/jobradar-v1.json"
