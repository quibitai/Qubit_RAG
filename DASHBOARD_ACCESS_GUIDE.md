# 📊 **Performance Dashboard Access Guide**

## **🎯 Dashboard Overview**

The **Brain API Performance Dashboard** is now fully operational following the successful Phase 4 rollout. You can access real-time metrics, system health, and monitoring data through the following endpoints.

---

## **🔗 Dashboard Endpoints**

### **Main Dashboard**
```
Base URL: /api/admin/dashboard
Authentication: Required (login needed)
```

#### **📋 Available Endpoints**

1. **System Overview** (Default)
   ```
   GET /api/admin/dashboard
   ```
   - Rollout status and system health
   - Quick performance stats
   - Available monitoring endpoints

2. **Real-Time Metrics**
   ```
   GET /api/admin/dashboard?endpoint=metrics
   ```
   - Live performance data
   - Success rates and response times
   - Modern vs legacy implementation breakdown
   - Throughput and reliability metrics

3. **System Summary**
   ```
   GET /api/admin/dashboard?endpoint=summary
   ```
   - 24-hour performance overview
   - System health indicators
   - Alert status summary
   - Rollout completion status

4. **Health Check**
   ```
   GET /api/admin/dashboard?endpoint=health
   ```
   - System operational status
   - Monitoring systems status
   - Service availability check

---

## **🧠 Memory Management Dashboard**

```
Base URL: /api/admin/memory
Authentication: Required (admin only)
```

#### **📊 Memory Endpoints**

1. **Memory Overview**
   ```
   GET /api/admin/memory
   ```
   - Current memory usage
   - Efficiency metrics
   - Available controls

2. **Detailed Statistics**
   ```
   GET /api/admin/memory?endpoint=stats
   ```
   - Heap, RSS, and external memory usage
   - Cache statistics and hit rates
   - Cleanup status and thresholds

3. **Memory Health**
   ```
   GET /api/admin/memory?endpoint=health
   ```
   - Memory health assessment
   - Warning indicators
   - Optimization recommendations

#### **🔧 Memory Controls**

1. **Manual Cleanup**
   ```
   POST /api/admin/memory
   Body: { "action": "cleanup" }
   ```
   - Trigger memory cleanup
   - View before/after statistics

2. **Force Garbage Collection**
   ```
   POST /api/admin/memory
   Body: { "action": "gc" }
   ```
   - Force garbage collection (if available)
   - Monitor memory freed

---

## **🚀 Quick Access Examples**

### **Using cURL (Command Line)**

```bash
# 1. System Health Check
curl -X GET "https://yourdomain.com/api/admin/dashboard?endpoint=health" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Real-Time Metrics
curl -X GET "https://yourdomain.com/api/admin/dashboard?endpoint=metrics" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Memory Statistics
curl -X GET "https://yourdomain.com/api/admin/memory?endpoint=stats" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Trigger Memory Cleanup
curl -X POST "https://yourdomain.com/api/admin/memory" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"action": "cleanup"}'
```

### **Using JavaScript (Frontend)**

```javascript
// Dashboard service helper
class DashboardAPI {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async getMetrics() {
    const response = await fetch(`${this.baseUrl}/api/admin/dashboard?endpoint=metrics`);
    return response.json();
  }

  async getSystemHealth() {
    const response = await fetch(`${this.baseUrl}/api/admin/dashboard?endpoint=health`);
    return response.json();
  }

  async getMemoryStats() {
    const response = await fetch(`${this.baseUrl}/api/admin/memory?endpoint=stats`);
    return response.json();
  }

  async triggerCleanup() {
    const response = await fetch(`${this.baseUrl}/api/admin/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cleanup' })
    });
    return response.json();
  }
}

// Usage
const dashboard = new DashboardAPI('https://yourdomain.com');
const metrics = await dashboard.getMetrics();
console.log('Current metrics:', metrics);
```

---

## **📈 Sample Dashboard Responses**

### **Real-Time Metrics Response**
```json
{
  "success": true,
  "data": {
    "timestamp": "2025-06-01T18:35:00.000Z",
    "timeWindow": "5m",
    "totalRequests": 142,
    "successRate": 0.972,
    "errorRate": 0.028,
    "averageResponseTime": 8300,
    "p95ResponseTime": 12400,
    "p99ResponseTime": 15200,
    "throughput": 28.4,
    "modernImplementation": {
      "requests": 142,
      "successRate": 0.972,
      "percentage": 100
    },
    "performanceImprovement": 23.5,
    "reliability": "excellent",
    "activeAlerts": []
  }
}
```

### **Memory Statistics Response**
```json
{
  "success": true,
  "data": {
    "current": {
      "heapUsed": "45.67MB",
      "heapTotal": "89.23MB",
      "rss": "156.78MB"
    },
    "status": "optimal",
    "cache": {
      "entries": 73,
      "maxEntries": 500,
      "hitRate": "89.2%"
    }
  }
}
```

---

## **🛡️ Security & Authentication**

### **Access Requirements**
- **Authentication**: User login required
- **Authorization**: Admin-level access for management endpoints
- **Rate Limiting**: Standard API rate limits apply
- **HTTPS**: All dashboard access should use HTTPS in production

### **Security Best Practices**
- Always use HTTPS for dashboard access
- Implement proper session management
- Monitor dashboard access logs
- Rotate authentication tokens regularly

---

## **📱 Integration Options**

### **1. Web Dashboard**
Build a React/Vue frontend that consumes these APIs for a visual dashboard interface.

### **2. Mobile Monitoring**
Create mobile apps that poll these endpoints for on-the-go system monitoring.

### **3. Slack/Discord Bots**
Set up automated bots that fetch metrics and send regular status updates.

### **4. Monitoring Tools**
Integrate with tools like Grafana, DataDog, or custom monitoring solutions.

---

## **🔧 Customization & Extension**

### **Adding Custom Metrics**
You can extend the dashboard by:
1. Adding new endpoints to existing routes
2. Creating new admin API routes
3. Implementing custom metric collection
4. Building specialized monitoring views

### **Dashboard Themes**
Consider implementing:
- Dark/light mode toggle
- Custom color schemes
- Responsive design for mobile
- Real-time auto-refresh capabilities

---

## **📞 Support & Troubleshooting**

### **Common Issues**
1. **Authentication Errors**: Ensure proper login and token validity
2. **404 Errors**: Verify correct endpoint URLs
3. **CORS Issues**: Configure proper CORS settings for frontend access
4. **Rate Limiting**: Implement appropriate request throttling

### **Getting Help**
- Check server logs for detailed error information
- Verify environment variable configuration
- Test endpoints with simple cURL commands first
- Monitor memory usage during heavy dashboard access

---

## **✅ Quick Start Checklist**

- [ ] Verify authentication is working
- [ ] Test basic dashboard endpoint: `/api/admin/dashboard`
- [ ] Check system health: `/api/admin/dashboard?endpoint=health`
- [ ] Monitor memory usage: `/api/admin/memory?endpoint=stats`
- [ ] Test memory cleanup: `POST /api/admin/memory` with `{"action": "cleanup"}`
- [ ] Set up monitoring automation (optional)
- [ ] Configure alerts and notifications (optional)

---

**🎉 Your Brain API Performance Dashboard is ready for production monitoring!**

*Access URL: `https://yourdomain.com/api/admin/dashboard`* 