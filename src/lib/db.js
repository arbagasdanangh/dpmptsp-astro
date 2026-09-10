/*import mysql from 'mysql2/promise';

export const db = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'ladpm'
});*/
// src/lib/db.js
import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host: '103.93.133.133',
  user: 'appuser',
  password: 'aATGBIdRtS50BbunLZuINgfT',
  database: 'appdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

