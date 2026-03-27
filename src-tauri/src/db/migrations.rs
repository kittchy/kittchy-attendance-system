use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS stamp_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL CHECK(event_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
            timestamp TEXT NOT NULL,
            date_key TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_stamp_events_date_key ON stamp_events(date_key);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;
    Ok(())
}
