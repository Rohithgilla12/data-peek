-- Perf Indicator Test Seed
-- Creates tables and data to test performance analysis features

-- Drop existing test tables if they exist
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- Create customers table (no indexes on commonly queried columns)
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create products table
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create orders table (foreign key but no index on customer_id)
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    order_number VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    total_amount DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create order_items table
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

-- Insert 50,000 customers
INSERT INTO customers (email, name, country, status, created_at)
SELECT
    'user' || i || '@example.com',
    'Customer ' || i,
    (ARRAY['USA', 'Canada', 'UK', 'Germany', 'France', 'Japan', 'Australia'])[1 + (i % 7)],
    (ARRAY['active', 'inactive', 'pending', 'suspended'])[1 + (i % 4)],
    NOW() - (random() * interval '365 days')
FROM generate_series(1, 50000) AS i;

-- Insert 1,000 products
INSERT INTO products (sku, name, category, price, stock_quantity, created_at)
SELECT
    'SKU-' || LPAD(i::text, 6, '0'),
    'Product ' || i,
    (ARRAY['Electronics', 'Clothing', 'Home', 'Sports', 'Books', 'Food', 'Toys'])[1 + (i % 7)],
    (random() * 500 + 10)::decimal(10,2),
    (random() * 1000)::integer,
    NOW() - (random() * interval '180 days')
FROM generate_series(1, 1000) AS i;

-- Insert 100,000 orders
INSERT INTO orders (customer_id, order_number, status, total_amount, created_at)
SELECT
    1 + (random() * 49999)::integer,
    'ORD-' || LPAD(i::text, 8, '0'),
    (ARRAY['pending', 'processing', 'shipped', 'delivered', 'cancelled'])[1 + (i % 5)],
    (random() * 1000 + 10)::decimal(10,2),
    NOW() - (random() * interval '90 days')
FROM generate_series(1, 100000) AS i;

-- Insert 300,000 order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT
    1 + (random() * 99999)::integer,
    1 + (random() * 999)::integer,
    1 + (random() * 5)::integer,
    (random() * 200 + 5)::decimal(10,2)
FROM generate_series(1, 300000) AS i;

-- Update statistics
ANALYZE customers;
ANALYZE products;
ANALYZE orders;
ANALYZE order_items;

-- Test queries that should trigger performance warnings:

-- 1. Sequential scan with filter (missing index on 'country')
-- SELECT * FROM customers WHERE country = 'USA';

-- 2. Sequential scan with filter (missing index on 'status')
-- SELECT * FROM orders WHERE status = 'pending';

-- 3. Join without index on foreign key
-- SELECT o.*, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'shipped';

-- 4. Query that would benefit from composite index
-- SELECT * FROM customers WHERE country = 'UK' AND status = 'active';

-- 5. Slow aggregation on large table
-- SELECT customer_id, COUNT(*), SUM(total_amount) FROM orders GROUP BY customer_id;

-- 6. N+1 pattern simulation - run these in quick succession:
-- SELECT * FROM orders WHERE id = 1;
-- SELECT * FROM orders WHERE id = 2;
-- SELECT * FROM orders WHERE id = 3;
-- ... (repeat for N+1 detection)

SELECT
    'Seed complete!' as message,
    (SELECT COUNT(*) FROM customers) as customers,
    (SELECT COUNT(*) FROM products) as products,
    (SELECT COUNT(*) FROM orders) as orders,
    (SELECT COUNT(*) FROM order_items) as order_items;
