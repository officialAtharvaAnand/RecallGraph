INSERT INTO services(name,owner_team) VALUES ('Checkout API','Payments'),('Notification Worker','Messaging'),('Identity Gateway','Platform') ON CONFLICT DO NOTHING;
INSERT INTO symptoms(label) VALUES ('Elevated latency'),('Timeouts'),('Queue backlog'),('Authentication errors') ON CONFLICT DO NOTHING;
