import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const agentReleases = pgTable(
  'agent_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: text('version').notNull(),
    platform: text('platform').notNull().default('win-x64'),
    sha256: text('sha256'),
    fileSize: integer('file_size'),
    fileName: text('file_name').notNull(),
    releaseNotes: text('release_notes'),
    isMandatory: boolean('is_mandatory').default(false).notNull(),
    isLatest: boolean('is_latest').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('agent_releases_version_platform_idx').on(table.version, table.platform),
  ],
);
