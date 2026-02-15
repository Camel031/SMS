.PHONY: up down build migrate makemigrations createsuperuser shell test lint

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

migrate:
	docker compose exec backend python manage.py migrate

makemigrations:
	docker compose exec backend python manage.py makemigrations

createsuperuser:
	docker compose exec backend python manage.py createsuperuser

shell:
	docker compose exec backend python manage.py shell

test-backend:
	docker compose exec backend pytest

lint-backend:
	docker compose exec backend ruff check .
	docker compose exec backend ruff format --check .

format-backend:
	docker compose exec backend ruff format .

reset-db:
	docker compose down -v
	docker compose up -d db
	sleep 3
	docker compose up -d backend
	docker compose exec backend python manage.py migrate
