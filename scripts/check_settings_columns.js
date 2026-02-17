import database from '../database/db.js'

async function run() {
  try {
    const res = await database.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='settings' ORDER BY ordinal_position;",
    )
    console.log('COLUMNS:', res.rows)
    process.exit(0)
  } catch (err) {
    console.error('ERROR:', err.message)
    process.exit(2)
  }
}

run()
