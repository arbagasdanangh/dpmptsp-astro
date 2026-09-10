import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host: '103.93.133.133',
  port: 3306,
  user: 'appuser',
  password: 'aATGBIdRtS50BbunLZuINgfT',
  database: 'appdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

try {
  const connection = await db.getConnection();
  console.log('MySQL connected!');
  connection.release();
} catch (error) {
  console.error('MySQL connection error:', error);
}
