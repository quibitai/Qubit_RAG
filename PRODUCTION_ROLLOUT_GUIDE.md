# 🚀 **Production Rollout Guide - Day 6**

## **Overview**
This guide provides a step-by-step process for safely rolling out the refactored brain API to production using the hybrid architecture approach with comprehensive monitoring and automatic rollback capabilities.

## **Pre-Rollout Checklist**

### **✅ Technical Readiness**
- [ ] All 8 services tested and validated (38 tests, 94.7% passing)
- [ ] LangChain bridge functional (329 lines, 90.9% test success)
- [ ] Performance comparison service active (456 lines)
- [ ] A/B testing framework configured
- [ ] Memory management optimized
- [ ] Performance dashboard operational
- [ ] Feature flags properly configured

### **✅ Environment Setup**
- [ ] Production environment variables configured
- [ ] Database connections validated
- [ ] External API dependencies verified
- [ ] Monitoring services active
- [ ] Backup systems ready
- [ ] Rollback procedures tested

### **✅ Team Readiness**
- [ ] DevOps team briefed on rollout process
- [ ] Support team trained on new monitoring
- [ ] Incident response procedures updated
- [ ] Communication channels established
- [ ] Decision makers identified and available

---

## **Phase 1: Initial Deployment (0-2 hours)**

### **Step 1: Deploy Code (15 minutes)**
```bash
# 1. Deploy new code to production
npm run build
npm run deploy:production

# 2. Verify deployment
curl -X GET https://api.yourdomain.com/api/brain?mode=health
```

### **Step 2: Initialize Services (15 minutes)**
```bash
# 1. Start performance dashboard
curl -X POST https://api.yourdomain.com/api/admin/dashboard/start

# 2. Initialize A/B testing (10% rollout)
curl -X POST https://api.yourdomain.com/api/admin/ab-testing/start \
  -H "Content-Type: application/json" \
  -d '{
    "testId": "brain-api-modern-rollout",
    "name": "Brain API Modern Implementation Rollout",
    "rolloutPercentage": 10,
    "enabled": true,
    "maxErrorRate": 0.05,
    "minSuccessRate": 0.95,
    "maxResponseTime": 15000,
    "enableAutoRollback": true
  }'

# 3. Start memory management
curl -X POST https://api.yourdomain.com/api/admin/memory/start
```

### **Step 3: Validation (30 minutes)**
```bash
# 1. Test legacy route (should work as before)
curl -X POST https://api.yourdomain.com/api/brain \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'

# 2. Test health endpoint
curl -X GET https://api.yourdomain.com/api/brain?mode=health

# 3. Check feature flag system
curl -X GET https://api.yourdomain.com/api/admin/feature-flags/status
```

### **Success Criteria**
- ✅ All health checks pass
- ✅ Legacy implementation working normally
- ✅ Feature flags responding correctly
- ✅ Monitoring systems active
- ✅ No immediate errors in logs

---

## **Phase 2: 10% Traffic Rollout (2-4 hours)**

### **Step 1: Monitor Initial Traffic (30 minutes)**
**Dashboard URL**: `https://api.yourdomain.com/dashboard`

**Key Metrics to Watch**:
- **Success Rate**: Should be ≥ 95%
- **Response Time**: Should be ≤ 15 seconds
- **Error Rate**: Should be ≤ 5%
- **Memory Usage**: Should be stable
- **A/B Test Metrics**: Modern vs Legacy comparison

### **Step 2: Real-Time Monitoring Commands**
```bash
# 1. Get real-time metrics
curl -X GET https://api.yourdomain.com/api/admin/dashboard/metrics?window=5m

# 2. Check A/B test results
curl -X GET https://api.yourdomain.com/api/admin/ab-testing/results

# 3. Monitor memory usage
curl -X GET https://api.yourdomain.com/api/admin/memory/stats

# 4. Check for alerts
curl -X GET https://api.yourdomain.com/api/admin/dashboard/alerts
```

### **Step 3: Performance Analysis (2 hours)**
**Review Checklist**:
- [ ] Modern implementation success rate ≥ Legacy success rate
- [ ] Response times within acceptable range
- [ ] No critical alerts triggered
- [ ] Memory usage stable and within thresholds
- [ ] User experience not degraded

### **Decision Point 1: Continue or Rollback**

**Continue if**:
- Success rate ≥ 95%
- Performance improvement ≥ 0% (no degradation)
- No critical alerts
- Memory usage stable

**Rollback if**:
- Success rate < 90%
- Performance degradation > 20%
- Critical alerts triggered
- Memory leaks detected

```bash
# Immediate rollback if needed
curl -X POST https://api.yourdomain.com/api/admin/ab-testing/stop
curl -X POST https://api.yourdomain.com/api/admin/feature-flags/disable \
  -d '{"flag": "USE_MODERN_BRAIN_API", "value": false}'
```

---

## **Phase 3: Gradual Increase (4-24 hours)**

### **Step 1: 25% Rollout (if 10% successful)**
```bash
curl -X POST https://api.yourdomain.com/api/admin/ab-testing/update \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 25}'
```

### **Step 2: 50% Rollout (if 25% successful)**
```bash
curl -X POST https://api.yourdomain.com/api/admin/ab-testing/update \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 50}'
```

### **Step 3: 75% Rollout (if 50% successful)**
```bash
curl -X POST https://api.yourdomain.com/api/admin/ab-testing/update \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 75}'
```

### **Monitoring at Each Stage**
**Wait Time**: 2-4 hours between increases
**Success Criteria**: Same as Phase 2 for each percentage level

---

## **Phase 4: Full Rollout (24-48 hours)**

### **Step 1: 100% Modern Implementation**
```bash
# 1. Complete the rollout
curl -X POST https://api.yourdomain.com/api/admin/ab-testing/update \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 100}'

# 2. Or directly enable for all users
curl -X POST https://api.yourdomain.com/api/admin/feature-flags/enable \
  -d '{"flag": "USE_MODERN_BRAIN_API", "value": true}'
```

### **Step 2: Monitor Full Traffic (24 hours)**
**Extended Monitoring Period**: Monitor for 24-48 hours to ensure stability

### **Step 3: Legacy Cleanup (After 48 hours)**
```bash
# Only after confirming full stability
# 1. Archive legacy implementation
mv app/api/brain/route.legacy.ts app/api/brain/route.legacy.backup.ts

# 2. Clean up feature flags
curl -X DELETE https://api.yourdomain.com/api/admin/feature-flags/USE_MODERN_BRAIN_API

# 3. Update monitoring baselines
curl -X POST https://api.yourdomain.com/api/admin/dashboard/update-baselines
```

---

## **Emergency Procedures**

### **Immediate Rollback**
```bash
#!/bin/bash
# emergency-rollback.sh
echo "🚨 EMERGENCY ROLLBACK INITIATED"

# 1. Disable modern implementation
curl -X POST https://api.yourdomain.com/api/admin/feature-flags/disable \
  -d '{"flag": "USE_MODERN_BRAIN_API", "value": false}'

# 2. Stop A/B testing
curl -X POST https://api.yourdomain.com/api/admin/ab-testing/emergency-stop

# 3. Force garbage collection
curl -X POST https://api.yourdomain.com/api/admin/memory/cleanup

# 4. Send alerts
curl -X POST https://api.yourdomain.com/api/admin/alerts/emergency \
  -d '{"message": "Brain API rolled back to legacy implementation"}'

echo "✅ Rollback completed. Legacy implementation active."
```

### **Incident Response**
**Who to Contact**:
1. **Tech Lead**: Primary decision maker
2. **DevOps Team**: Infrastructure and deployment
3. **Product Team**: User impact assessment
4. **Support Team**: Customer communication

**Communication Template**:
```
🚨 INCIDENT: Brain API Rollout Issue
Time: [TIMESTAMP]
Issue: [DESCRIPTION]
Impact: [USER_IMPACT]
Action Taken: [ROLLBACK_STATUS]
ETA: [RESOLUTION_TIME]
Next Update: [NEXT_UPDATE_TIME]
```

---

## **Success Metrics & KPIs**

### **Technical Metrics**
- **Response Time**: Improved by ≥ 10%
- **Success Rate**: Maintained at ≥ 95%
- **Error Rate**: Reduced or maintained ≤ 5%
- **Memory Usage**: Optimized with better cleanup
- **Tool Efficiency**: Better tool selection and execution

### **Business Metrics**
- **User Satisfaction**: No degradation in user experience
- **System Reliability**: Improved uptime and stability
- **Development Velocity**: Easier maintenance and feature development
- **Cost Efficiency**: Reduced resource usage

### **Rollout Timeline Summary**
```
Hour 0-2:    Initial deployment and validation
Hour 2-4:    10% traffic rollout
Hour 4-8:    25% traffic rollout (if successful)
Hour 8-16:   50% traffic rollout (if successful)
Hour 16-24:  75% traffic rollout (if successful)
Hour 24-48:  100% traffic rollout
Hour 48+:    Legacy cleanup and optimization
```

---

## **Post-Rollout Activities**

### **Week 1: Monitoring & Optimization**
- [ ] Daily performance reviews
- [ ] Memory usage optimization
- [ ] Alert threshold tuning
- [ ] Documentation updates

### **Week 2: Analysis & Reporting**
- [ ] Comprehensive performance analysis
- [ ] Business impact assessment
- [ ] Team retrospective
- [ ] Lessons learned documentation

### **Week 3: Future Planning**
- [ ] Next optimization targets identified
- [ ] Architecture improvement roadmap
- [ ] Tool enhancement planning
- [ ] Advanced feature development

---

## **Risk Mitigation**

### **Identified Risks & Mitigation**
1. **Performance Degradation**
   - *Mitigation*: Automatic rollback at 20% degradation
   - *Monitoring*: Real-time performance comparison

2. **Memory Leaks**
   - *Mitigation*: Memory management service with automatic cleanup
   - *Monitoring*: Memory threshold alerts

3. **Tool Execution Issues**
   - *Mitigation*: LangChain bridge with fallback to legacy tools
   - *Monitoring*: Tool success rate tracking

4. **User Experience Impact**
   - *Mitigation*: Gradual rollout with user feedback monitoring
   - *Monitoring*: Success rate and response time tracking

### **Communication Plan**
- **Internal Updates**: Every 2 hours during rollout
- **Stakeholder Reports**: Daily summary
- **User Communication**: Only if issues detected
- **Final Report**: 1 week post-rollout

---

## **Troubleshooting Guide**

### **Common Issues & Solutions**

**Issue: High Memory Usage**
```bash
# Check memory stats
curl -X GET https://api.yourdomain.com/api/admin/memory/stats

# Force cleanup
curl -X POST https://api.yourdomain.com/api/admin/memory/cleanup

# Check for memory leaks
curl -X GET https://api.yourdomain.com/api/admin/memory/leaks
```

**Issue: Performance Degradation**
```bash
# Get performance comparison
curl -X GET https://api.yourdomain.com/api/admin/performance/comparison

# Check tool execution times
curl -X GET https://api.yourdomain.com/api/admin/tools/performance

# Review system load
curl -X GET https://api.yourdomain.com/api/admin/system/load
```

**Issue: Increased Error Rate**
```bash
# Get error breakdown
curl -X GET https://api.yourdomain.com/api/admin/errors/analysis

# Check recent error logs
curl -X GET https://api.yourdomain.com/api/admin/logs/errors?limit=100

# Test specific endpoints
curl -X POST https://api.yourdomain.com/api/brain/test
```

---

## **Success Declaration**

**The rollout is considered successful when**:
✅ **Week 1**: All metrics stable and improved
✅ **No rollbacks** required during the process
✅ **User feedback** positive or neutral
✅ **System reliability** maintained or improved
✅ **Performance targets** met or exceeded
✅ **Team confidence** high in the new system

**Timeline**: Full success declaration after 2 weeks of stable operation.

---

## **Contact Information**

**Primary Contacts**:
- **Tech Lead**: [Name] - [Email] - [Phone]
- **DevOps Lead**: [Name] - [Email] - [Phone]
- **Product Lead**: [Name] - [Email] - [Phone]

**Emergency Contacts**:
- **On-Call Engineer**: [Phone]
- **Incident Commander**: [Phone]
- **Executive Escalation**: [Phone]

**Communication Channels**:
- **Slack**: #brain-api-rollout
- **Email**: brain-api-team@company.com
- **Dashboard**: https://api.yourdomain.com/dashboard

---

*This guide ensures a safe, methodical rollout of the brain API refactoring with multiple safety nets and clear decision points at every stage.* 