CREATE DATABASE IF NOT EXISTS rashcuts
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rashcuts;

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_sessions_token_hash (token_hash),
  KEY idx_admin_sessions_expiry (expires_at),
  CONSTRAINT fk_admin_sessions_user
    FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_change_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_session_id BIGINT UNSIGNED NOT NULL,
  admin_user_id BIGINT UNSIGNED NOT NULL,
  area VARCHAR(40) NOT NULL,
  action VARCHAR(40) NOT NULL,
  entity_id VARCHAR(190) DEFAULT '',
  summary VARCHAR(800) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email_sent_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_change_session (admin_session_id, email_sent_at, created_at),
  KEY idx_change_user (admin_user_id, created_at),
  CONSTRAINT fk_change_events_user
    FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_settings (
  id TINYINT UNSIGNED NOT NULL,
  admin_email VARCHAR(190) NOT NULL DEFAULT '',
  client_email VARCHAR(190) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS booking_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visitor_key VARCHAR(80) NOT NULL DEFAULT '',
  stage VARCHAR(24) NOT NULL DEFAULT 'started',
  channel VARCHAR(24) NOT NULL DEFAULT '',
  service_summary VARCHAR(1000) NOT NULL DEFAULT '',
  service_count INT UNSIGNED NOT NULL DEFAULT 0,
  appointment_date DATE DEFAULT NULL,
  appointment_time VARCHAR(40) NOT NULL DEFAULT '',
  private_session TINYINT(1) NOT NULL DEFAULT 0,
  estimated_total INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash CHAR(64) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_booking_created (created_at),
  KEY idx_booking_visitor_stage (visitor_key, stage, created_at)
) ENGINE=InnoDB;

INSERT INTO notification_settings (id, admin_email, client_email)
VALUES (1, '', '')
ON DUPLICATE KEY UPDATE id=id;

CREATE TABLE IF NOT EXISTS site_settings (
  id VARCHAR(32) NOT NULL,
  name VARCHAR(190) NOT NULL DEFAULT 'Rashcuts',
  address VARCHAR(255) NOT NULL DEFAULT 'Hill-Top GRA',
  area VARCHAR(190) DEFAULT 'Hill-Top GRA',
  lga VARCHAR(190) DEFAULT 'Chanchaga',
  city VARCHAR(190) NOT NULL DEFAULT 'Minna',
  state VARCHAR(190) NOT NULL DEFAULT 'Niger State',
  country VARCHAR(190) NOT NULL DEFAULT 'Nigeria',
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  place_id VARCHAR(255) DEFAULT '',
  directions_url TEXT,
  hours VARCHAR(120) DEFAULT '09:00 — 20:00',
  wallpaper_url TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(80) NOT NULL,
  category VARCHAR(80) NOT NULL,
  name VARCHAR(190) NOT NULL,
  price INT UNSIGNED NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  image_name VARCHAR(255) DEFAULT '',
  image_url TEXT,
  image_alt VARCHAR(255) DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_services_sort (category, sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS work_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  image VARCHAR(255) DEFAULT '',
  image_url TEXT,
  alt VARCHAR(255) NOT NULL DEFAULT 'Rashcuts finished work',
  service VARCHAR(190) NOT NULL DEFAULT 'Rashcuts',
  category VARCHAR(190) NOT NULL DEFAULT 'Finished work',
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_work_sort (sort_order, created_at)
) ENGINE=InnoDB;

INSERT INTO site_settings
  (id, name, address, area, lga, city, state, country, latitude, longitude, place_id, directions_url, hours, wallpaper_url)
VALUES
  ('main', 'RASHCUTS / STUDIO', 'Hill-Top GRA', 'Hill-Top GRA', 'Chanchaga', 'Minna', 'Niger State', 'Nigeria', 9.6100000, 6.5500000, '', '', '09:00 — 20:00', '/assets/experience/baber.webp')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO services (id, category, name, price, description, image_name, image_url, image_alt, sort_order) VALUES
('classic-cut','cuts','Classic Cut',12000,'A clean, considered cut shaped around your features, routine and preferred finish.','service-classic-cut.webp','','Classic haircut service — clean, considered cut at Rashcuts',0),
('fade','cuts','Fade',15000,'Clean tapering and fading tailored to your hair, texture and preferred finish.','service-fade.webp','','Fade haircut service — tailored fade finish at Rashcuts',1),
('taper','cuts','Low / Mid / High Taper',15000,'A controlled taper that keeps the silhouette sharp without losing your natural shape.','service-taper.webp','','Low, mid or high taper haircut service at Rashcuts',2),
('skin-fade','cuts','Skin Fade',17000,'A close, precise fade that moves cleanly from skin into the shape above.','service-skin-fade.webp','','Skin fade haircut service — close, precise fade at Rashcuts',3),
('shape-up','cuts','Shape-Up / Line-Up',9000,'Crisp edges, cleaned lines and a sharper frame around the style you already wear.','service-shape-up.webp','','Shape-up and line-up service — crisp finished edges at Rashcuts',4),
('braids','texture','Braids',25000,'Structured braid styling with attention to neat sections, tension and the finished silhouette.','service-braids.webp','','Braids styling service — structured braided hairstyle at Rashcuts',0),
('hair-colour','texture','Hair Dye / Colour',30000,'Colour work planned around the look you want, with the finish kept intentional and wearable.','service-hair-colour.webp','','Hair colour service — dye and colour work at Rashcuts',1),
('relaxing','texture','Relaxing / Texturizing',22000,'Texture adjustment with a considered finish that still feels like you.','service-relaxing.webp','','Relaxing and texturizing service — controlled texture finish at Rashcuts',2),
('locs-twist','texture','Locs / Twist Styling',28000,'Defined loc or twist styling with clean sections, balanced shape and a finish built to last.','service-locs-twist.webp','','Locs and twist styling service at Rashcuts',3),
('hair-treatment','texture','Hair Treatment',15000,'A focused treatment for healthier-feeling hair, scalp care and a cleaner finished texture.','service-hair-treatment.webp','','Hair and scalp treatment service at Rashcuts',4),
('beard-grooming','grooming','Beard Grooming',9000,'Shape, clean-up and finish for a beard that looks deliberate without looking overworked.','service-beard-grooming.webp','','Beard grooming service — shape and clean-up at Rashcuts',0),
('beard-shave','grooming','Beard Shave',8000,'A close, clean shave with careful prep and a refined finish.','service-beard-shave.webp','','Beard shave service — close, clean finish at Rashcuts',1),
('hair-beard','grooming','Hair + Beard Combo',21000,'A coordinated haircut and beard finish handled as one complete look.','service-hair-beard-combo.webp','','Haircut and beard combo service at Rashcuts',2),
('full-grooming','grooming','Full Grooming Session',30000,'A complete grooming reset combining the details that make the whole look work.','service-full-grooming.webp','','Full grooming session — coordinated haircut and finish at Rashcuts',3),
('hot-towel-facial','grooming','Hot Towel Facial',12000,'A warm, refreshing facial reset with focused cleansing and a clean, finished feel.','service-hot-towel-facial.webp','','Hot towel facial grooming service at Rashcuts',4)
ON DUPLICATE KEY UPDATE
  category=VALUES(category), name=VALUES(name), price=VALUES(price), description=VALUES(description), image_name=VALUES(image_name), image_alt=VALUES(image_alt), sort_order=VALUES(sort_order);

INSERT INTO work_items (id, image, image_url, alt, service, category, sort_order, active) VALUES
(NULL,'blonde-taper.webp','','Blonde taper haircut — finished look at Rashcuts','Blonde Taper','Finished work',0,1),
(NULL,'starter-locs.webp','','Starter locs styling — defined finish at Rashcuts','Starter Locs','Texture',1,1),
(NULL,'two-strand-twists.webp','','Two-strand twists — clean sectioned styling at Rashcuts','Two-Strand Twists','Texture',2,1),
(NULL,'360-waves.webp','','360 waves — polished wave pattern at Rashcuts','360 Waves','Finished work',3,1),
(NULL,'waves.webp','','Waves hairstyle — polished wave pattern at Rashcuts','Waves','Finished work',4,1),
(NULL,'service-locs-twist.webp','','Locs and twist styling — clean finished look at Rashcuts','Locs / Twist Styling','Texture',5,1),
(NULL,'buzz-cut-line-up.webp','','Buzz cut with line-up — crisp finished shape at Rashcuts','Buzz Cut + Line-Up','Finished work',6,1),
(NULL,'drop-fade.webp','','Drop fade — clean finished fade at Rashcuts','Drop Fade','Fades',7,1),
(NULL,'high-taper-fade.webp','','High taper fade — textured finished haircut at Rashcuts','High Taper Fade','Fades',8,1),
(NULL,'mid-taper-fade.webp','','Mid taper fade — clean finished haircut at Rashcuts','Mid Taper Fade','Fades',9,1),
(NULL,'taper-beard.webp','','Taper and beard grooming — finished service at Rashcuts','Taper + Beard','Grooming',10,1),
(NULL,'22-plus-black-mens-cuts.webp','','Men’s haircut inspiration — modern finished look at Rashcuts','Men’s Cuts','Inspiration',11,1),
(NULL,'modern-textured-fade.webp','','Modern textured fade — finished haircut at Rashcuts','Textured Fade','Fades',12,1),
(NULL,'modern-classic-haircut.webp','','Modern classic haircut — clean scissor finish at Rashcuts','Classic Cut','Finished work',13,1),
(NULL,'luxury-full-grooming.webp','','Full grooming haircut and beard finish at Rashcuts','Full Grooming','Grooming',14,1),
(NULL,'black-men-beard-grooming.webp','','Beard grooming — clean shaped finish at Rashcuts','Beard Grooming','Grooming',15,1);
