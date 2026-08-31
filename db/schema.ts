import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable(
  'profiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    visitorHash: text('visitor_hash').notNull(),
    name: text('name').notNull(),
    currentAge: integer('current_age').notNull(),
    consentVersion: text('consent_version').notNull().default('2026-08-31'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_profiles_visitor_hash').on(table.visitorHash)],
);

export const lifeStages = sqliteTable(
  'life_stages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    stageOrder: integer('stage_order').notNull(),
    ageLabel: text('age_label').notNull(),
    title: text('title').notNull(),
    memory: text('memory').notNull(),
    value: text('value').notNull(),
    stageType: text('stage_type').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_life_stages_profile_order').on(table.profileId, table.stageOrder)],
);

export const councils = sqliteTable(
  'councils',
  {
    id: text('id').primaryKey(),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    category: text('category').notNull(),
    responsesJson: text('responses_json').notNull(),
    synthesisJson: text('synthesis_json').notNull(),
    actionText: text('action_text').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_councils_profile_created').on(table.profileId, table.createdAt)],
);

export const councilFeedback = sqliteTable(
  'council_feedback',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    councilId: text('council_id')
      .notNull()
      .references(() => councils.id, { onDelete: 'cascade' }),
    helpfulness: integer('helpfulness').notNull(),
    wouldReturn: integer('would_return', { mode: 'boolean' }).notNull(),
    note: text('note').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_feedback_council').on(table.councilId)],
);

export const councilTurns = sqliteTable(
  'council_turns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    councilId: text('council_id')
      .notNull()
      .references(() => councils.id, { onDelete: 'cascade' }),
    stageKey: text('stage_key').notNull(),
    userMessage: text('user_message').notNull(),
    stageReply: text('stage_reply').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_turns_council_created').on(table.councilId, table.createdAt)],
);

export const productEvents = sqliteTable(
  'product_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: integer('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
    visitorHash: text('visitor_hash').notNull(),
    eventName: text('event_name').notNull(),
    payloadJson: text('payload_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_events_name_created').on(table.eventName, table.createdAt)],
);
