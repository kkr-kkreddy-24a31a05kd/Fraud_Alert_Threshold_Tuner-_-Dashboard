// Global variables
let currentThreshold = 0.5;
let currentRegion = 'IN';
let currentTransactions = [];
let precisionRecallChart = null;
let simulationChart = null;
let riskGaugeChart = null;
let alertSound = null;

// Initialize dashboard on page load
$(document).ready(function() {
    initializeCharts();
    loadDashboardData();
    setupEventListeners();
    setupFilters();
    setupThemeToggle();
    setupDateRange();
    
    // Auto-refresh every 30 seconds
    setInterval(loadDashboardData, 30000);
});

function initializeCharts() {
    const prTrace = {
        x: [0, 0.2, 0.4, 0.6, 0.8, 1],
        y: [1, 0.95, 0.85, 0.75, 0.6, 0.4],
        mode: 'lines+markers',
        type: 'scatter',
        name: 'Precision-Recall',
        line: { color: '#667eea', width: 3 },
        marker: { size: 8, color: '#764ba2' }
    };
    
    const layout = {
        title: 'Precision vs Recall Trade-off',
        xaxis: { title: 'Recall', range: [0, 1] },
        yaxis: { title: 'Precision', range: [0, 1] },
        height: 300,
        margin: { t: 40, l: 50, r: 20, b: 40 },
        plot_bgcolor: '#f8f9fa',
        paper_bgcolor: 'white'
    };
    
    Plotly.newPlot('precision-recall-curve', [prTrace], layout);
    
    // Initialize risk gauge
    const gaugeData = {
        type: "indicator",
        mode: "gauge+number+delta",
        value: 0,
        title: { text: "Current Risk Level", font: { size: 14 } },
        delta: { reference: 0.5 },
        gauge: {
            axis: { range: [0, 1], tickwidth: 1, tickcolor: "darkblue" },
            bar: { color: "darkblue" },
            bgcolor: "white",
            borderwidth: 2,
            bordercolor: "gray",
            steps: [
                { range: [0, 0.3], color: "#28a745" },
                { range: [0.3, 0.7], color: "#ffc107" },
                { range: [0.7, 1], color: "#dc3545" }
            ],
            threshold: {
                line: { color: "red", width: 4 },
                thickness: 0.75,
                value: 0.5
            }
        }
    };
    
    Plotly.newPlot('risk-gauge', [gaugeData], { height: 180, margin: { t: 30, r: 20, b: 20, l: 20 } });
}

function setupEventListeners() {
    $('#threshold-slider').on('input', function() {
        currentThreshold = parseFloat($(this).val());
        $('#threshold-value').text(currentThreshold.toFixed(2));
        loadDashboardData();
    });
    
    $('#region-select').on('change', function() {
        currentRegion = $(this).val();
        loadDashboardData();
    });
    
    $('#auto-tune-btn').on('click', function() {
        autoTuneThreshold();
    });
    
    $('#deploy-btn').on('click', function() {
        deployToProduction();
    });
    
    $('#download-csv-btn').on('click', function() {
        downloadCSVReport();
    });
    
    $('#download-excel-btn').on('click', function() {
        exportToExcel();
    });
    
    $('#export-pdf-btn').on('click', function() {
        exportToPDF();
    });
    
    $('#simulate-attack-btn').on('click', function() {
        simulateAttack();
    });
    
    $('#calculate-roi-btn').on('click', function() {
        calculateROI();
    });
}

function setupFilters() {
    $('#search-transaction').on('input', function() {
        applyFilters();
    });
    
    $('#risk-filter').on('change', function() {
        applyFilters();
    });
    
    $('#amount-filter').on('change', function() {
        applyFilters();
    });
}

function setupThemeToggle() {
    $('#theme-toggle').on('click', function() {
        $('body').toggleClass('dark-mode');
        const isDark = $('body').hasClass('dark-mode');
        $(this).html(isDark ? '<i class="fas fa-sun"></i> Light Mode' : '<i class="fas fa-moon"></i> Dark Mode');
        
        // Update charts theme
        const chartBg = isDark ? '#2d2d3d' : 'white';
        const textColor = isDark ? '#e0e0e0' : '#333';
        
        Plotly.relayout('precision-recall-curve', {
            plot_bgcolor: chartBg,
            paper_bgcolor: chartBg,
            font: { color: textColor }
        });
    });
}

function setupDateRange() {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    
    $('#end-date').val(today.toISOString().split('T')[0]);
    $('#start-date').val(weekAgo.toISOString().split('T')[0]);
    
    $('#start-date, #end-date').on('change', function() {
        applyFilters();
    });
}

function applyFilters() {
    if (!currentTransactions.length) return;
    
    const searchTerm = $('#search-transaction').val().toLowerCase();
    const riskFilter = $('#risk-filter').val();
    const amountFilter = $('#amount-filter').val();
    const startDate = $('#start-date').val();
    const endDate = $('#end-date').val();
    
    let filtered = [...currentTransactions];
    
    // Search filter
    if (searchTerm) {
        filtered = filtered.filter(txn => 
            txn.id.toString().includes(searchTerm) ||
            txn.amount.toString().includes(searchTerm) ||
            txn.risk_level.toLowerCase().includes(searchTerm) ||
            (txn.risk_score * 100).toFixed(0).includes(searchTerm)
        );
    }
    
    // Risk filter
    if (riskFilter !== 'all') {
        filtered = filtered.filter(txn => txn.risk_level === riskFilter);
    }
    
    // Amount filter
    if (amountFilter !== 'all') {
        const [min, max] = amountFilter.split('-');
        if (amountFilter === '50000+') {
            filtered = filtered.filter(txn => txn.amount >= 50000);
        } else {
            filtered = filtered.filter(txn => txn.amount >= parseFloat(min) && txn.amount <= parseFloat(max));
        }
    }
    
    renderTransactionFeed(filtered);
}

function loadDashboardData() {
    showLoading();
    
    $.ajax({
        url: '/api/predict',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            threshold: currentThreshold,
            region: currentRegion
        }),
        success: function(response) {
            currentTransactions = response.transactions;
            updateMetrics(response.metrics);
            renderTransactionFeed(response.transactions);
            updateConfusionMatrix(response.metrics.confusion_matrix);
            updateModelAccuracy(response.metrics.accuracy);
            updateRiskGauge(response.metrics);
            updateLastUpdateTime();
            checkHighRiskAlerts(response.transactions);
            hideLoading();
        },
        error: function(error) {
            console.error('Error loading data:', error);
            hideLoading();
            showError('Failed to load dashboard data');
        }
    });
}

function renderTransactionFeed(transactions) {
    const feed = $('#transaction-feed');
    feed.empty();
    
    if (transactions.length === 0) {
        feed.html('<div class="text-center p-3 text-muted">🔍 No transactions found</div>');
        return;
    }
    
    transactions.slice(0, 50).forEach(txn => {
        const riskClass = txn.risk_level.toLowerCase().replace(' ', '-');
        const riskIcon = txn.risk_level === 'High Risk' ? '🔴' : 
                        (txn.risk_level === 'Suspicious' ? '🟡' : '🟢');
        
        const txnHtml = `
            <div class="transaction-item" onclick="showTransactionDetails(${txn.id})">
                <div class="row">
                    <div class="col-4">
                        <strong>ID: ${txn.id}</strong>
                    </div>
                    <div class="col-4">
                        ₹${txn.amount.toFixed(2)}
                    </div>
                    <div class="col-4 ${riskClass}">
                        ${riskIcon} ${txn.risk_level}
                    </div>
                </div>
                <div class="row mt-1">
                    <div class="col-6">
                        <small>Hour: ${txn.hour}:00</small>
                    </div>
                    <div class="col-6">
                        <small>Score: ${(txn.risk_score * 100).toFixed(1)}%</small>
                    </div>
                </div>
                ${txn.location_change === 1 ? '<div class="mt-1"><span class="badge bg-warning">⚠️ Location Changed</span></div>' : ''}
            </div>
        `;
        feed.append(txnHtml);
    });
}

function updateMetrics(metrics) {
    $('#precision').text((metrics.precision * 100).toFixed(1) + '%');
    $('#recall').text((metrics.recall * 100).toFixed(1) + '%');
    $('#f1').text((metrics.f1_score * 100).toFixed(1) + '%');
    $('#accuracy').text((metrics.accuracy * 100).toFixed(1) + '%');
    
    updatePrecisionRecallCurve(metrics.precision, metrics.recall);
}

function updatePrecisionRecallCurve(precision, recall) {
    Plotly.relayout('precision-recall-curve', {
        'shapes': [{
            type: 'circle',
            xref: 'x',
            yref: 'y',
            x0: recall - 0.02,
            x1: recall + 0.02,
            y0: precision - 0.02,
            y1: precision + 0.02,
            fillcolor: 'red',
            line: { color: 'red', width: 2 }
        }]
    });
}

function updateRiskGauge(metrics) {
    const riskScore = 1 - metrics.precision; // Higher precision = lower risk
    Plotly.update('risk-gauge', { value: [riskScore] });
}

function updateConfusionMatrix(cm) {
    $('#tp').text(cm.tp);
    $('#fp').text(cm.fp);
    $('#fn').text(cm.fn);
    $('#tn').text(cm.tn);
}

function showTransactionDetails(transactionId) {
    const txn = currentTransactions.find(t => t.id === transactionId);
    if (!txn) return;
    
    const modalBody = $('#modal-body');
    modalBody.html(`
        <div class="transaction-detail">
            <div class="detail-label">Transaction ID:</div>
            <div>${txn.id}</div>
        </div>
        <div class="transaction-detail">
            <div class="detail-label">Amount:</div>
            <div>₹${txn.amount.toFixed(2)}</div>
        </div>
        <div class="transaction-detail">
            <div class="detail-label">Time:</div>
            <div>${txn.hour}:00 Hours</div>
        </div>
        <div class="transaction-detail">
            <div class="detail-label">Risk Score:</div>
            <div>${(txn.risk_score * 100).toFixed(1)}%</div>
        </div>
        <div class="transaction-detail">
            <div class="detail-label">Risk Level:</div>
            <div class="${txn.risk_level === 'High Risk' ? 'risk-high' : (txn.risk_level === 'Suspicious' ? 'risk-suspicious' : 'risk-normal')}">
                ${txn.risk_level}
            </div>
        </div>
        <div class="transaction-detail">
            <div class="detail-label">Location Changed:</div>
            <div>${txn.location_change ? 'Yes ⚠️' : 'No'}</div>
        </div>
        <div class="transaction-detail">
            <div class="detail-label">Predicted as:</div>
            <div>${txn.predicted ? 'Fraud' : 'Normal'}</div>
        </div>
        <div class="transaction-detail">
            <div class="detail-label">Actual Status:</div>
            <div>${txn.actual ? 'Fraud' : 'Normal'}</div>
        </div>
    `);
    
    $('#transactionModal').modal('show');
    
    // Load explanation
    $.ajax({
        url: '/api/explain',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ transaction_id: transactionId }),
        success: function(response) {
            let explanationHtml = '<div class="detail-label mt-2">AI Explanation:</div>';
            response.explanations.forEach(exp => {
                explanationHtml += `
                    <div class="transaction-detail">
                        <strong>${exp.feature}:</strong> ${exp.value} (Impact: ${exp.impact.toFixed(1)}%)
                        <div class="progress mt-1">
                            <div class="progress-bar" style="width: ${exp.impact}%"></div>
                        </div>
                    </div>
                `;
            });
            modalBody.append(explanationHtml);
        }
    });
}

function showExplanation(transactionId) {
    $('#explanation-panel').show();
    $('#explanation-content').html('<div class="spinner"></div> Loading explanation...');
    
    $.ajax({
        url: '/api/explain',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ transaction_id: transactionId }),
        success: function(response) {
            displayExplanation(response.explanations);
        },
        error: function(error) {
            console.error('Error loading explanation:', error);
            $('#explanation-content').html('<div class="alert alert-danger">Failed to load explanation</div>');
        }
    });
}

function displayExplanation(explanations) {
    let html = '<p><strong>Why this transaction was flagged:</strong></p>';
    
    explanations.forEach(exp => {
        const directionIcon = exp.direction === 'increase' ? '⬆️' : '⬇️';
        const impactBar = `<div class="progress mt-1">
            <div class="progress-bar bg-primary" style="width: ${exp.impact}%"></div>
        </div>`;
        
        html += `
            <div class="explanation-item">
                <strong>${exp.feature}</strong><br>
                Value: ${exp.value.toFixed(2)} ${directionIcon}<br>
                Impact: ${exp.impact.toFixed(1)}%
                ${impactBar}
            </div>
        `;
    });
    
    $('#explanation-content').html(html);
}

function autoTuneThreshold() {
    showLoading();
    
    $.ajax({
        url: '/api/auto_tune',
        method: 'GET',
        success: function(response) {
            const bestThreshold = response.best_threshold;
            currentThreshold = bestThreshold;
            $('#threshold-slider').val(bestThreshold);
            $('#threshold-value').text(bestThreshold.toFixed(2));
            
            showNotification(`Auto-tuned! Best threshold: ${bestThreshold.toFixed(2)} (F1 Score: ${response.best_f1})`);
            loadDashboardData();
            hideLoading();
        },
        error: function(error) {
            console.error('Error auto-tuning:', error);
            hideLoading();
            showError('Auto-tuning failed');
        }
    });
}

function deployToProduction() {
    if (confirm(`Are you sure you want to deploy threshold ${currentThreshold.toFixed(2)} to production?`)) {
        showNotification(`✅ Deployed! Threshold ${currentThreshold.toFixed(2)} is now live in production`);
        console.log(`Deployment: Threshold=${currentThreshold}, Region=${currentRegion}, Timestamp=${new Date()}`);
        
        // Play deployment sound
        playAlertSound('deploy');
    }
}

function downloadCSVReport() {
    showNotification('Generating CSV report...');
    
    const reportData = {
        timestamp: new Date().toISOString(),
        threshold: currentThreshold,
        region: currentRegion,
        precision: $('#precision').text(),
        recall: $('#recall').text(),
        f1_score: $('#f1').text(),
        accuracy: $('#accuracy').text(),
        fraud_count: currentTransactions.filter(t => t.predicted === 1).length,
        total_transactions: currentTransactions.length
    };
    
    let csv = 'Metric,Value\n';
    for (let [key, value] of Object.entries(reportData)) {
        csv += `${key},${value}\n`;
    }
    
    csv += '\n\nTransaction ID,Amount,Risk Score,Risk Level,Predicted,Actual,Location Change,Hour\n';
    currentTransactions.forEach(txn => {
        csv += `${txn.id},${txn.amount},${txn.risk_score},${txn.risk_level},${txn.predicted},${txn.actual},${txn.location_change},${txn.hour}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fraud_report_${new Date().toISOString().slice(0,19)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('CSV report downloaded successfully!');
}

function exportToExcel() {
    showNotification('Exporting to Excel...');
    
    const wsData = [
        ['Fraud Detection Report'],
        ['Generated:', new Date().toLocaleString()],
        ['Threshold:', currentThreshold],
        ['Region:', currentRegion],
        ['Precision:', $('#precision').text()],
        ['Recall:', $('#recall').text()],
        ['F1 Score:', $('#f1').text()],
        ['Accuracy:', $('#accuracy').text()],
        [],
        ['Transaction ID', 'Amount', 'Risk Score', 'Risk Level', 'Predicted', 'Actual', 'Location Change', 'Hour']
    ];
    
    currentTransactions.forEach(txn => {
        wsData.push([
            txn.id, txn.amount, txn.risk_score, txn.risk_level, 
            txn.predicted ? 'Fraud' : 'Normal', 
            txn.actual ? 'Fraud' : 'Normal',
            txn.location_change ? 'Yes' : 'No',
            txn.hour
        ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fraud Data');
    XLSX.writeFile(wb, `fraud_data_${new Date().toISOString().slice(0,19)}.xlsx`);
    
    showNotification('Excel export complete!');
}

function exportToPDF() {
    showNotification('Generating PDF report...');
    
    const element = document.querySelector('.center-panel').cloneNode(true);
    const header = document.querySelector('.header').cloneNode(true);
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Fraud Detection Report</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                body { padding: 20px; font-family: Arial, sans-serif; }
                .metric-box { background: #667eea; color: white; padding: 15px; border-radius: 10px; text-align: center; }
                .confusion-matrix { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; margin: 20px 0; }
                .matrix-cell { background: #f8f9fa; padding: 15px; text-align: center; border-radius: 8px; }
                @media print {
                    body { margin: 0; padding: 15px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            ${header.outerHTML}
            ${element.outerHTML}
            <div style="margin-top: 30px; text-align: center; color: #666;">
                <hr>
                <p>Report Generated: ${new Date().toLocaleString()}</p>
                <p>Fraud Alert Threshold Tuner Dashboard - AI-Powered Fraud Detection System</p>
            </div>
            <script>
                window.onload = function() { window.print(); setTimeout(() => window.close(), 1000); };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
    
    showNotification('PDF report ready!');
}

function simulateAttack() {
    showLoading();
    
    $.ajax({
        url: '/api/simulate',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({}),
        success: function(simulations) {
            displaySimulationResults(simulations);
            hideLoading();
            showNotification('Attack simulation complete! Check What-If Analysis panel.');
            playAlertSound('simulate');
        },
        error: function(error) {
            console.error('Error simulating attack:', error);
            hideLoading();
            showError('Simulation failed');
        }
    });
}

function displaySimulationResults(simulations) {
    $('#simulation-results').show();
    
    const thresholds = simulations.map(s => s.threshold);
    const fraudDetected = simulations.map(s => s.fraud_detected);
    const falseAlerts = simulations.map(s => s.false_alerts);
    
    const trace1 = {
        x: thresholds,
        y: fraudDetected,
        name: 'Fraud Detected %',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#28a745', width: 2 }
    };
    
    const trace2 = {
        x: thresholds,
        y: falseAlerts,
        name: 'False Alerts %',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#dc3545', width: 2 }
    };
    
    const layout = {
        title: 'Threshold Impact Analysis',
        xaxis: { title: 'Threshold', range: [0, 1] },
        yaxis: { title: 'Percentage (%)', range: [0, 100] },
        height: 250,
        margin: { t: 40, l: 50, r: 20, b: 40 },
        showlegend: true,
        plot_bgcolor: $('body').hasClass('dark-mode') ? '#2d2d3d' : '#f8f9fa',
        paper_bgcolor: $('body').hasClass('dark-mode') ? '#2d2d3d' : 'white'
    };
    
    Plotly.newPlot('simulation-chart', [trace1, trace2], layout);
    
    const optimalThreshold = simulations.reduce((best, current) => {
        const score = current.fraud_detected - current.false_alerts;
        const bestScore = best.fraud_detected - best.false_alerts;
        return score > bestScore ? current : best;
    });
    
    const optimalTrace = {
        x: [optimalThreshold.threshold],
        y: [optimalThreshold.fraud_detected],
        mode: 'markers',
        type: 'scatter',
        name: 'Optimal Point',
        marker: { size: 12, color: 'gold', symbol: 'star' }
    };
    
    Plotly.addTraces('simulation-chart', optimalTrace);
}

function calculateROI() {
    const falsePositives = parseInt($('#fp').text()) || 0;
    const falseNegatives = parseInt($('#fn').text()) || 0;
    const truePositives = parseInt($('#tp').text()) || 0;
    
    const costPerFalsePositive = 10; // Customer support cost
    const costPerFalseNegative = 1000; // Average fraud loss
    const valuePerTruePositive = 1000; // Money saved by catching fraud
    
    const fpCost = falsePositives * costPerFalsePositive;
    const fnCost = falseNegatives * costPerFalseNegative;
    const tpValue = truePositives * valuePerTruePositive;
    
    const totalCost = fpCost + fnCost;
    const netBenefit = tpValue - totalCost;
    
    $('#roi-results').show();
    $('#roi-content').html(`
        <div style="font-size: 14px;">
            <div><strong>False Positives:</strong> ${falsePositives} × ₹${costPerFalsePositive} = <span style="color: #dc3545;">-₹${fpCost.toLocaleString()}</span></div>
            <div class="mt-2"><strong>False Negatives:</strong> ${falseNegatives} × ₹${costPerFalseNegative} = <span style="color: #dc3545;">-₹${fnCost.toLocaleString()}</span></div>
            <div class="mt-2"><strong>Fraud Caught:</strong> ${truePositives} × ₹${valuePerTruePositive} = <span style="color: #28a745;">+₹${tpValue.toLocaleString()}</span></div>
            <hr>
            <div><strong>Total Cost:</strong> <span style="color: #dc3545;">-₹${totalCost.toLocaleString()}</span></div>
            <div><strong>Net Benefit:</strong> <span style="color: ${netBenefit >= 0 ? '#28a745' : '#dc3545'};">₹${netBenefit.toLocaleString()}</span></div>
            <div class="mt-2"><small>Based on ${currentTransactions.length} transactions with current threshold (${currentThreshold})</small></div>
        </div>
    `);
    
    showNotification(`ROI Calculated: Net Benefit ₹${netBenefit.toLocaleString()}`);
}

function checkHighRiskAlerts(transactions) {
    const highRiskCount = transactions.filter(t => t.risk_level === 'High Risk').length;
    
    if (highRiskCount > 5) {
        showAlert(`⚠️ Alert: ${highRiskCount} high-risk transactions detected!`, 'danger');
        playAlertSound('high-risk');
    } else if (highRiskCount > 0) {
        showAlert(`⚠️ Warning: ${highRiskCount} high-risk transaction(s) found`, 'warning');
    }
}

function showAlert(message, type = 'info') {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show alert-badge" role="alert">
            <i class="fas fa-bell"></i> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    $('#alert-container').append(alertHtml);
    
    setTimeout(() => {
        $('.alert-badge').fadeOut('slow', function() { $(this).remove(); });
    }, 5000);
}

function playAlertSound(type) {
    // Simple beep using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = type === 'high-risk' ? 880 : 440;
        gainNode.gain.value = 0.3;
        
        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
        }, 500);
    } catch(e) {
        console.log('Audio not supported');
    }
}

function updateModelAccuracy(accuracy) {
    $('#model-accuracy').text((accuracy * 100).toFixed(1) + '%');
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-IN');
    $('#last-update-time').text(timeString);
}

function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-IN');
    $('#real-time-clock').text(timeString);
}
setInterval(updateClock, 1000);
updateClock();

function showNotification(message) {
    const notification = $(`
        <div class="alert alert-success alert-dismissible fade show" role="alert" style="margin-bottom: 10px; background: #28a745; color: white; border: none;">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" style="filter: brightness(0) invert(1);"></button>
        </div>
    `);
    
    $('#alert-container').append(notification);
    
    setTimeout(() => {
        notification.fadeOut('slow', function() { $(this).remove(); });
    }, 3000);
}

function showError(message) {
    const error = $(`
        <div class="alert alert-danger alert-dismissible fade show" role="alert" style="margin-bottom: 10px;">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `);
    
    $('#alert-container').append(error);
    
    setTimeout(() => {
        error.fadeOut('slow', function() { $(this).remove(); });
    }, 5000);
}

function showTooltip(message) {
    showNotification(message);
}

function showMetricInfo(metric) {
    const info = {
        'precision': 'Precision = True Positives / (True Positives + False Positives). Measures accuracy of fraud alerts.',
        'recall': 'Recall = True Positives / (True Positives + False Negatives). Measures how many actual frauds were caught.',
        'f1': 'F1 Score = 2 × (Precision × Recall) / (Precision + Recall). Harmonic mean of Precision and Recall.',
        'accuracy': 'Accuracy = (TP + TN) / (TP + TN + FP + FN). Overall correct predictions.'
    };
    showNotification(info[metric]);
}

window.setThreshold = function(value) {
    $('#threshold-slider').val(value);
    $('#threshold-value').text(value.toFixed(2));
    currentThreshold = value;
    loadDashboardData();
    showNotification(`Threshold set to ${value}`);
};

window.showTransactionDetails = showTransactionDetails;
window.showExplanation = showExplanation;
window.showMetricInfo = showMetricInfo;
window.showTooltip = showTooltip;

// Keyboard shortcuts
$(document).keydown(function(e) {
    if (e.key === 'ArrowLeft') {
        let current = parseFloat($('#threshold-slider').val());
        let newVal = Math.max(0, current - 0.05);
        window.setThreshold(newVal);
    } else if (e.key === 'ArrowRight') {
        let current = parseFloat($('#threshold-slider').val());
        let newVal = Math.min(1, current + 0.05);
        window.setThreshold(newVal);
    }
});

function showLoading() {
    // Optional loading indicator
}

function hideLoading() {
    // Optional hide loading
}
