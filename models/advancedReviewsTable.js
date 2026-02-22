/**
 * Advanced Reviews Table Schema
 * Insane-level review system with all enterprise features
 */

import database from '../database/db.js'

export async function createAdvancedReviewsTable() {
  try {
    // Create main reviews table with all fields
    const createReviewsQuery = `
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        product_id UUID NOT NULL,
        user_id UUID NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        comment TEXT,
        verified_purchase BOOLEAN DEFAULT false,
        helpful_count INTEGER DEFAULT 0,
        unhelpful_count INTEGER DEFAULT 0,
        images TEXT[] DEFAULT '{}',
        sentiment_score FLOAT DEFAULT 0,
        sentiment_label VARCHAR(20),
        moderation_status VARCHAR(20) DEFAULT 'pending',
        moderation_reason TEXT,
        moderated_by UUID,
        moderated_at TIMESTAMP,
        flagged_count INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `

    // Create review votes table (user helpfulness votes)
    const createReviewVotesQuery = `
      CREATE TABLE IF NOT EXISTS review_votes (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        review_id UUID NOT NULL,
        user_id UUID NOT NULL,
        vote_type VARCHAR(10) CHECK (vote_type IN ('helpful', 'unhelpful')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(review_id, user_id)
      );
    `

    // Create review flags table (inappropriate content reporting)
    const createReviewFlagsQuery = `
      CREATE TABLE IF NOT EXISTS review_flags (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        review_id UUID NOT NULL,
        user_id UUID NOT NULL,
        reason VARCHAR(100) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'open',
        resolved_by UUID,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `

    // Create review replies table
    const createReviewRepliesQuery = `
      CREATE TABLE IF NOT EXISTS review_replies (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        review_id UUID NOT NULL,
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        reply_type VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `

    // Create review statistics materialized view
    const createReviewStatsQuery = `
      CREATE TABLE IF NOT EXISTS review_statistics (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        product_id UUID NOT NULL UNIQUE,
        total_reviews INTEGER DEFAULT 0,
        avg_rating FLOAT DEFAULT 0,
        five_star_count INTEGER DEFAULT 0,
        four_star_count INTEGER DEFAULT 0,
        three_star_count INTEGER DEFAULT 0,
        two_star_count INTEGER DEFAULT 0,
        one_star_count INTEGER DEFAULT 0,
        verified_purchase_reviews INTEGER DEFAULT 0,
        avg_helpful_votes FLOAT DEFAULT 0,
        sentiment_positive_count INTEGER DEFAULT 0,
        sentiment_neutral_count INTEGER DEFAULT 0,
        sentiment_negative_count INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
    `

    // Execute all queries
    await Promise.all([
      database.query(createReviewsQuery),
      database.query(createReviewVotesQuery),
      database.query(createReviewFlagsQuery),
      database.query(createReviewRepliesQuery),
      database.query(createReviewStatsQuery),
    ])

    // Create indexes for performance
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_verified ON reviews(verified_purchase)`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_moderation ON reviews(moderation_status)`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_review_votes_review ON review_votes(review_id)`,
      `CREATE INDEX IF NOT EXISTS idx_review_flags_review ON review_flags(review_id)`,
      `CREATE INDEX IF NOT EXISTS idx_review_flags_status ON review_flags(status)`,
      `CREATE INDEX IF NOT EXISTS idx_review_replies_review ON review_replies(review_id)`,
      `CREATE INDEX IF NOT EXISTS idx_review_stats_product ON review_statistics(product_id)`,
    ]

    for (const query of indexQueries) {
      try {
        await database.query(query)
      } catch (error) {
        console.warn(`⚠️ Index creation warning:`, error.message)
      }
    }

    // Create aggregation function for stats update
    const createTriggerQuery = `
      CREATE OR REPLACE FUNCTION update_review_statistics()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO review_statistics (
          product_id,
          total_reviews,
          avg_rating,
          five_star_count,
          four_star_count,
          three_star_count,
          two_star_count,
          one_star_count,
          verified_purchase_reviews,
          last_updated
        )
        SELECT
          product_id,
          COUNT(*),
          COALESCE(AVG(rating), 0),
          COUNT(CASE WHEN rating = 5 THEN 1 END),
          COUNT(CASE WHEN rating = 4 THEN 1 END),
          COUNT(CASE WHEN rating = 3 THEN 1 END),
          COUNT(CASE WHEN rating = 2 THEN 1 END),
          COUNT(CASE WHEN rating = 1 THEN 1 END),
          COUNT(CASE WHEN verified_purchase = true THEN 1 END),
          NOW()
        FROM reviews
        WHERE moderation_status = 'approved' AND product_id = NEW.product_id
        ON CONFLICT (product_id) DO UPDATE SET
          total_reviews = EXCLUDED.total_reviews,
          avg_rating = EXCLUDED.avg_rating,
          five_star_count = EXCLUDED.five_star_count,
          four_star_count = EXCLUDED.four_star_count,
          three_star_count = EXCLUDED.three_star_count,
          two_star_count = EXCLUDED.two_star_count,
          one_star_count = EXCLUDED.one_star_count,
          verified_purchase_reviews = EXCLUDED.verified_purchase_reviews,
          last_updated = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `

    await database.query(createTriggerQuery)

    // Create trigger
    await database.query(`
      DROP TRIGGER IF EXISTS review_stats_trigger ON reviews;
      CREATE TRIGGER review_stats_trigger
      AFTER INSERT OR UPDATE OR DELETE ON reviews
      FOR EACH ROW
      EXECUTE FUNCTION update_review_statistics();
    `)

    console.log('✅ Advanced reviews schema created successfully')
  } catch (error) {
    console.error('❌ Failed to create advanced reviews schema:', error.message)
  }
}

export async function migrateReviewsTable() {
  try {
    // Add columns if they don't exist
    const alterQueries = [
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sentiment_score FLOAT DEFAULT 0`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sentiment_label VARCHAR(20)`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'pending'`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderation_reason TEXT`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderated_by UUID`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS flagged_count INTEGER DEFAULT 0`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false`,
      `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS unhelpful_count INTEGER DEFAULT 0`,
    ]

    for (const query of alterQueries) {
      try {
        await database.query(query)
      } catch (error) {
        console.warn(`⚠️ Migration warning:`, error.message)
      }
    }

    console.log('✅ Reviews table migrated successfully')
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
  }
}
