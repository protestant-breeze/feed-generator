import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
  },
}

// Adds the columns the taste-scored "for-you" feed needs. Text is kept so the
// scoring can be re-tuned against real captured posts without re-ingesting.
migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('post').addColumn('text', 'varchar').execute()
    await db.schema.alterTable('post').addColumn('score', 'real').execute()
    await db.schema.alterTable('post').addColumn('topics', 'varchar').execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('text').execute()
    await db.schema.alterTable('post').dropColumn('score').execute()
    await db.schema.alterTable('post').dropColumn('topics').execute()
  },
}
