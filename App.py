from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np
import joblib
import shap
import sqlite3
from datetime import datetime
import json
import os

app = Flask(__name__)

# Initialize model (will train on first run)
model = None
explainer = None

def train_fraud_model():
    """Train XGBoost model with sample data"""
    from sklearn.model_selection import train_test_split
    from xgboost import XGBClassifier
    
    print("Training fraud detection model...")
    
    # Generate sample transaction data
    np.random.seed(42)
    n_samples = 1000
    
    # Features: amount, hour, location_change, device_type, prev_fraud
    X = pd.DataFrame({
        'amount': np.random.exponential(5000, n_samples),
        'hour': np.random.randint(0, 24, n_samples),
        'location_change': np.random.randint(0, 2, n_samples),
        'device_trust_score': np.random.beta(2, 5, n_samples),
        'txn_frequency_1h': np.random.poisson(2, n_samples),
        'amount_velocity': np.random.exponential(10000, n_samples)
    })
    
    # Generate labels (fraud ~10%)
    fraud_prob = (X['amount'] > 15000) * 0.5 + \
                 (X['location_change'] == 1) * 0.3 + \
                 (X['hour'].between(0, 5)) * 0.2
    y = (fraud_prob + np.random.normal(0, 0.1, n_samples) > 0.5).astype(int)
    
    # Train model
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = XGBClassifier(n_estimators=100, max_depth=4, random_state=42, use_label_encoder=False, eval_metric='logloss')
    model.fit(X_train, y_train)
    
    # Create SHAP explainer
    explainer = shap.TreeExplainer(model)
    
    # Save model
    os.makedirs('models', exist_ok=True)
    joblib.dump(model, 'models/fraud_model.pkl')
    joblib.dump(explainer, 'models/shap_explainer.pkl')
    
    print("Model training complete!")
    return model, explainer, X_test

@app.route('/')
def dashboard():
    return render_template('index.html')

@app.route('/api/predict', methods=['POST'])
def predict():
    """Get predictions for all transactions"""
    threshold = request.json.get('threshold', 0.5)
    region = request.json.get('region', 'IN')
    
    # Load model
    model = joblib.load('models/fraud_model.pkl')
    
    # Load transactions from DB
    conn = sqlite3.connect('database.db')
    transactions = pd.read_sql_query("SELECT * FROM transactions ORDER BY id DESC LIMIT 100", conn)
    conn.close()
    
    # Get predictions
    features = transactions[['amount', 'hour', 'location_change', 'device_trust_score', 
                             'txn_frequency_1h', 'amount_velocity']]
    
    probabilities = model.predict_proba(features)[:, 1]
    predictions = (probabilities >= threshold).astype(int)
    
    # Calculate metrics
    actual = transactions['is_fraud'].values
    tp = sum((predictions == 1) & (actual == 1))
    fp = sum((predictions == 1) & (actual == 0))
    fn = sum((predictions == 0) & (actual == 1))
    tn = sum((predictions == 0) & (actual == 0))
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    
    # Prepare results
    results = []
    for i, row in transactions.iterrows():
        risk_score = probabilities[i]
        risk_level = 'High Risk' if risk_score >= 0.7 else ('Suspicious' if risk_score >= 0.3 else 'Normal')
        
        results.append({
            'id': row['id'],
            'amount': float(row['amount']),
            'hour': int(row['hour']),
            'risk_score': float(risk_score),
            'risk_level': risk_level,
            'predicted': int(predictions[i]),
            'actual': int(row['is_fraud']),
            'location_change': int(row['location_change'])
        })
    
    return jsonify({
        'transactions': results,
        'metrics': {
            'precision': round(precision, 3),
            'recall': round(recall, 3),
            'f1_score': round(f1, 3),
            'accuracy': round((tp + tn) / (tp + tn + fp + fn), 3),
            'confusion_matrix': {'tp': int(tp), 'fp': int(fp), 'fn': int(fn), 'tn': int(tn)},
            'fraud_count': int(sum(predictions))
        }
    })

@app.route('/api/explain', methods=['POST'])
def explain():
    """Get SHAP explanation for a transaction"""
    data = request.json
    transaction_id = data.get('transaction_id')
    
    model = joblib.load('models/fraud_model.pkl')
    explainer = joblib.load('models/shap_explainer.pkl')
    
    # Get transaction features
    conn = sqlite3.connect('database.db')
    txn = pd.read_sql_query(f"SELECT * FROM transactions WHERE id = {transaction_id}", conn)
    conn.close()
    
    features = txn[['amount', 'hour', 'location_change', 'device_trust_score', 
                    'txn_frequency_1h', 'amount_velocity']]
    
    # Get SHAP values
    shap_values = explainer.shap_values(features)
    
    # Create explanation
    feature_names = ['Amount', 'Transaction Hour', 'Location Changed', 
                     'Device Trust Score', 'Frequency in Last Hour', 'Amount Velocity']
    
    explanations = []
    for i, (name, value, shap_val) in enumerate(zip(feature_names, features.iloc[0], shap_values[0])):
        impact = abs(shap_val) / sum(abs(shap_values[0])) * 100
        explanations.append({
            'feature': name,
            'value': float(value),
            'impact': float(impact),
            'direction': 'increase' if shap_val > 0 else 'decrease'
        })
    
    # Sort by impact
    explanations.sort(key=lambda x: x['impact'], reverse=True)
    
    return jsonify({'explanations': explanations[:5]})  # Top 5 features

@app.route('/api/simulate', methods=['POST'])
def simulate():
    """What-if analysis for different thresholds"""
    thresholds = np.arange(0.1, 1.0, 0.1)
    
    model = joblib.load('models/fraud_model.pkl')
    
    conn = sqlite3.connect('database.db')
    transactions = pd.read_sql_query("SELECT * FROM transactions", conn)
    conn.close()
    
    features = transactions[['amount', 'hour', 'location_change', 'device_trust_score', 
                             'txn_frequency_1h', 'amount_velocity']]
    probabilities = model.predict_proba(features)[:, 1]
    actual = transactions['is_fraud'].values
    
    simulations = []
    for thresh in thresholds:
        pred = (probabilities >= thresh).astype(int)
        tp = sum((pred == 1) & (actual == 1))
        fp = sum((pred == 1) & (actual == 0))
        fn = sum((pred == 0) & (actual == 1))
        tn = sum((pred == 0) & (actual == 0))
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        
        simulations.append({
            'threshold': round(thresh, 1),
            'fraud_detected': round(recall * 100, 1),
            'false_alerts': round(fp / (fp + tn) * 100, 1) if (fp + tn) > 0 else 0,
            'precision': round(precision * 100, 1),
            'recall': round(recall * 100, 1)
        })
    
    return jsonify(simulations)

@app.route('/api/auto_tune', methods=['GET'])
def auto_tune():
    """Find best threshold based on F1 score"""
    model = joblib.load('models/fraud_model.pkl')
    
    conn = sqlite3.connect('database.db')
    transactions = pd.read_sql_query("SELECT * FROM transactions", conn)
    conn.close()
    
    features = transactions[['amount', 'hour', 'location_change', 'device_trust_score', 
                             'txn_frequency_1h', 'amount_velocity']]
    probabilities = model.predict_proba(features)[:, 1]
    actual = transactions['is_fraud'].values
    
    best_f1 = 0
    best_threshold = 0.5
    
    for thresh in np.arange(0.1, 0.95, 0.05):
        pred = (probabilities >= thresh).astype(int)
        tp = sum((pred == 1) & (actual == 1))
        fp = sum((pred == 1) & (actual == 0))
        fn = sum((pred == 0) & (actual == 1))
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        
        if f1 > best_f1:
            best_f1 = f1
            best_threshold = thresh
    
    return jsonify({'best_threshold': round(best_threshold, 2), 'best_f1': round(best_f1, 3)})

def init_database():
    """Initialize SQLite database with sample data"""
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    
    # Create table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL,
            hour INTEGER,
            location_change INTEGER,
            device_trust_score REAL,
            txn_frequency_1h INTEGER,
            amount_velocity REAL,
            is_fraud INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Check if data exists
    cursor.execute("SELECT COUNT(*) FROM transactions")
    if cursor.fetchone()[0] == 0:
        print("Generating sample transaction data...")
        # Generate sample transactions
        np.random.seed(42)
        for _ in range(500):
            amount = np.random.exponential(5000)
            hour = np.random.randint(0, 24)
            location_change = np.random.randint(0, 2)
            device_score = np.random.beta(2, 5)
            frequency = np.random.poisson(2)
            velocity = np.random.exponential(10000)
            
            # Fraud logic
            fraud_prob = (amount > 15000) * 0.5 + (location_change == 1) * 0.3 + (hour < 6) * 0.2
            is_fraud = 1 if (fraud_prob + np.random.normal(0, 0.1)) > 0.5 else 0
            
            cursor.execute('''
                INSERT INTO transactions (amount, hour, location_change, device_trust_score, 
                                         txn_frequency_1h, amount_velocity, is_fraud)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (amount, hour, location_change, device_score, frequency, velocity, is_fraud))
        
        conn.commit()
        print("Sample data generated!")
    
    conn.close()

if __name__ == '__main__':
    init_database()
    
    # Train model if not exists
    if not os.path.exists('models/fraud_model.pkl'):
        model, explainer, _ = train_fraud_model()
    
    app.run(debug=True, port=5000)
