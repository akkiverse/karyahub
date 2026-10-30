"""Alembic environment. Migrations run from code (db.engine.ensure_ready) on a connection we pass in."""

from alembic import context

connection = context.config.attributes["connection"]
context.configure(connection=connection, target_metadata=None)
with context.begin_transaction():
    context.run_migrations()
