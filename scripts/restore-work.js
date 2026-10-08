const mysql = require('mysql2/promise');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const defaultWork = [
  ['blonde-taper.webp', 'Blonde taper haircut — finished look at Rashcuts', 'Blonde Taper', 'Finished work'],
  ['starter-locs.webp', 'Starter locs styling — defined finish at Rashcuts', 'Starter Locs', 'Texture'],
  ['two-strand-twists.webp', 'Two-strand twists — clean sectioned styling at Rashcuts', 'Two-Strand Twists', 'Texture'],
  ['360-waves.webp', '360 waves — polished wave pattern at Rashcuts', '360 Waves', 'Finished work'],
  ['waves.webp', 'Waves hairstyle — polished wave pattern at Rashcuts', 'Waves', 'Finished work'],
  ['service-locs-twist.webp', 'Locs and twist styling — clean finished look at Rashcuts', 'Locs / Twist Styling', 'Texture'],
  ['buzz-cut-line-up.webp', 'Buzz cut with line-up — crisp finished shape at Rashcuts', 'Buzz Cut + Line-Up', 'Finished work'],
  ['drop-fade.webp', 'Drop fade — clean finished fade at Rashcuts', 'Drop Fade', 'Fades'],
  ['high-taper-fade.webp', 'High taper fade — textured finished haircut at Rashcuts', 'High Taper Fade', 'Fades'],
  ['mid-taper-fade.webp', 'Mid taper fade — clean finished haircut at Rashcuts', 'Mid Taper Fade', 'Fades'],
  ['taper-beard.webp', 'Taper and beard grooming — finished service at Rashcuts', 'Taper + Beard', 'Grooming'],
  ['22-plus-black-mens-cuts.webp', "Men's haircut inspiration — modern finished look at Rashcuts", "Men's Cuts", 'Inspiration'],
  ['modern-textured-fade.webp', 'Modern textured fade — finished haircut at Rashcuts', 'Textured Fade', 'Fades'],
  ['modern-classic-haircut.webp', 'Modern classic haircut — clean scissor finish at Rashcuts', 'Classic Cut', 'Finished work'],
  ['luxury-full-grooming.webp', 'Full grooming haircut and beard finish at Rashcuts', 'Full Grooming', 'Grooming'],
  ['black-men-beard-grooming.webp', 'Beard grooming — clean shaped finish at Rashcuts', 'Beard Grooming', 'Grooming'],
];

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rashcuts'
  });

  try {
    await connection.beginTransaction();

    // Do not restore the removed Rashcuts Studio image.
    await connection.execute(
      `DELETE FROM work_items WHERE LOWER(image) IN ('rashcuts-studio.webp', 'rashcuts-studio.jpg', 'rashcuts-studio.png') OR LOWER(image_url) LIKE '%rashcuts-studio%'`
    );

    for (let index = 0; index < defaultWork.length; index += 1) {
      const [rows] = await connection.execute(
        'SELECT id FROM work_items WHERE image=? LIMIT 1',
        [defaultWork[index][0]]
      );
      const [image, alt, service, category] = defaultWork[index];

      if (rows.length) {
        await connection.execute(
          'UPDATE work_items SET alt=?, service=?, category=?, sort_order=?, active=1 WHERE id=?',
          [alt, service, category, index, rows[0].id]
        );
      } else {
        await connection.execute(
          'INSERT INTO work_items (image, image_url, alt, service, category, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
          [image, '', alt, service, category, index]
        );
      }
    }

    // Preserve custom/uploaded rows and place them after the restored defaults.
    const placeholders = defaultWork.map(() => '?').join(',');
    const [customRows] = await connection.execute(
      `SELECT id FROM work_items WHERE image NOT IN (${placeholders}) ORDER BY created_at ASC, id ASC`,
      defaultWork.map((row) => row[0])
    );
    for (let i = 0; i < customRows.length; i += 1) {
      await connection.execute('UPDATE work_items SET sort_order=? WHERE id=?', [defaultWork.length + i, customRows[i].id]);
    }

    await connection.commit();
    const [countRows] = await connection.query('SELECT COUNT(*) AS count FROM work_items WHERE active=1');
    console.log(`Gallery restored. Active gallery items: ${countRows[0].count}. Custom/uploaded items were preserved.`);
  } catch (error) {
    await connection.rollback();
    console.error('Gallery restore failed:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
})();
