'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Activity,
  Database,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  MemoryStick,
  Gauge,
  Zap,
  Eye,
  Settings,
  MessageSquare,
  FileText,
  Users,
  Plus,
} from 'lucide-react';
import { ChatPaneToggle } from '@/components/ChatPaneToggle';
import Link from 'next/link';
import { toast } from 'sonner';

// User dashboard interfaces
interface DashboardStats {
  totalChats: number;
  totalDocuments: number;
  activeUsers: number;
  systemStatus: 'online' | 'offline' | 'maintenance';
}

// Admin dashboard interfaces
interface AdminDashboardData {
  success: boolean;
  data: {
    title: string;
    rolloutStatus: string;
    systemHealth: {
      status: string;
      implementation: string;
      legacySystem: string;
      emergencyRollback: string;
    };
    quickStats: {
      successRate: string;
      averageResponseTime: string;
      errorRate: string;
      uptime: string;
    };
    monitoring: {
      realTimeMetrics: boolean;
      alerting: boolean;
      memoryManagement: boolean;
      performanceTracking: boolean;
    };
  };
  timestamp: string;
}

interface MetricsData {
  success: boolean;
  data: {
    timestamp: string;
    timeWindow: string;
    totalRequests: number;
    successRate: number;
    errorRate: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number;
    modernImplementation: {
      requests: number;
      successRate: number;
      averageResponseTime: number;
      errorRate: number;
      percentage: number;
    };
    performanceImprovement: number;
    reliability: string;
    activeAlerts: any[];
  };
}

interface MemoryData {
  success: boolean;
  data: {
    overview: {
      status: string;
      heapUsage: string;
      totalMemory: string;
      efficiency: string;
    };
    features: {
      automaticCleanup: boolean;
      memoryLeakDetection: boolean;
      cacheManagement: boolean;
      gcOptimization: boolean;
    };
  };
}

export default function CombinedDashboard() {
  // User dashboard state
  const [stats, setStats] = useState<DashboardStats>({
    totalChats: 0,
    totalDocuments: 0,
    activeUsers: 0,
    systemStatus: 'online',
  });

  // Admin dashboard state
  const [adminData, setAdminData] = useState<AdminDashboardData | null>(null);
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Load user dashboard stats
  const loadUserStats = async () => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setStats({
      totalChats: 127,
      totalDocuments: 45,
      activeUsers: 8,
      systemStatus: 'online',
    });
  };

  // Load admin dashboard data
  const fetchAdminData = async () => {
    try {
      setLoading(true);

      // Fetch all admin data in parallel
      const [adminRes, metricsRes, memoryRes] = await Promise.all([
        fetch('/api/admin/dashboard'),
        fetch('/api/admin/dashboard?endpoint=metrics'),
        fetch('/api/admin/memory'),
      ]);

      if (adminRes.ok) {
        const data = await adminRes.json();
        setAdminData(data);
      }

      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetricsData(data);
      }

      if (memoryRes.ok) {
        const data = await memoryRes.json();
        setMemoryData(data);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
      toast.error('Failed to refresh admin data');
    } finally {
      setLoading(false);
    }
  };

  // Memory cleanup handler
  const handleMemoryCleanup = async () => {
    try {
      const response = await fetch('/api/admin/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup' }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Memory cleanup completed. Freed: ${result.freed}`);
        fetchAdminData();
      } else {
        toast.error('Memory cleanup failed');
      }
    } catch (error) {
      console.error('Memory cleanup error:', error);
      toast.error('Memory cleanup failed');
    }
  };

  // Initialize data
  useEffect(() => {
    Promise.all([loadUserStats(), fetchAdminData()]);

    // Auto-refresh admin data every 30 seconds
    const interval = setInterval(fetchAdminData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'operational':
      case 'healthy':
      case 'optimal':
        return 'text-green-600 bg-green-100';
      case 'warning':
      case 'maintenance':
        return 'text-yellow-600 bg-yellow-100';
      case 'offline':
      case 'critical':
      case 'error':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header with chat pane controls */}
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between w-full px-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <Shield className="w-6 h-6 mr-3 text-blue-600" />
              System Dashboard
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Comprehensive monitoring and system overview
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* System status indicator */}
            <div
              className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(adminData?.data?.systemHealth?.status || stats.systemStatus)}`}
            >
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-current" />
                {adminData?.data?.systemHealth?.status ||
                  `System ${stats.systemStatus}`}
              </div>
            </div>

            {/* Refresh button */}
            <Button onClick={fetchAdminData} disabled={loading} size="sm">
              <RefreshCw
                className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>

            {/* New chat button */}
            <Link href="/">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Chat
              </Button>
            </Link>

            {/* Chat pane toggle */}
            <ChatPaneToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Admin Rollout Status Banner */}
          {adminData && (
            <Card className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-green-200 dark:border-green-700">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CheckCircle className="w-6 h-6 text-green-600 mr-3" />
                    <div>
                      <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                        {adminData.data.rolloutStatus}
                      </h3>
                      <p className="text-green-600 dark:text-green-300 text-sm">
                        Modern implementation:{' '}
                        {adminData.data.systemHealth.implementation} • Legacy
                        system: {adminData.data.systemHealth.legacySystem}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">
                      100%
                    </div>
                    <div className="text-sm text-green-500">Complete</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Combined Stats Grid - User + Admin */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-6">
            {/* User Stats */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Chats
                </CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalChats}</div>
                <p className="text-xs text-muted-foreground">
                  <TrendingUp className="inline w-3 h-3 mr-1" />
                  +12% from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Documents</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalDocuments}</div>
                <p className="text-xs text-muted-foreground">
                  <TrendingUp className="inline w-3 h-3 mr-1" />
                  +8% from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Active Users
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeUsers}</div>
                <p className="text-xs text-muted-foreground">
                  Currently online
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  System Health
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">99.9%</div>
                <p className="text-xs text-muted-foreground">
                  Uptime this month
                </p>
              </CardContent>
            </Card>

            {/* Admin Stats */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Success Rate
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {adminData?.data?.quickStats?.successRate || '97.2%'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Current 5-minute window
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Response Time
                </CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {adminData?.data?.quickStats?.averageResponseTime || '8.3s'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Average response time
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Error Rate
                </CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {adminData?.data?.quickStats?.errorRate || '2.1%'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Within acceptable limits
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  System Uptime
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {adminData?.data?.quickStats?.uptime || '100%'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Since rollout completion
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Combined Action Cards and Performance Monitoring */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks and shortcuts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link href="/" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Start New Chat
                  </Button>
                </Link>
                <Link href="/editor" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <FileText className="w-4 h-4 mr-2" />
                    Create Document
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled
                >
                  <Users className="w-4 h-4 mr-2" />
                  Manage Users (Coming Soon)
                </Button>
              </CardContent>
            </Card>

            {/* Real-time Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="w-5 h-5 mr-2" />
                  Real-time Performance
                </CardTitle>
                <CardDescription>
                  Live system metrics and throughput
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {metricsData ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">
                        Total Requests (5m)
                      </span>
                      <span className="text-lg font-bold">
                        {metricsData.data.totalRequests}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Throughput</span>
                      <span className="text-lg font-bold">
                        {metricsData.data.throughput} req/min
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">
                        P95 Response Time
                      </span>
                      <span className="text-lg font-bold">
                        {(metricsData.data.p95ResponseTime / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-green-600">
                          Performance Improvement
                        </span>
                        <span className="text-lg font-bold text-green-600">
                          +{metricsData.data.performanceImprovement}%
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Memory Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MemoryStick className="w-5 h-5 mr-2" />
                  Memory Management
                </CardTitle>
                <CardDescription>
                  System memory usage and optimization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {memoryData ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Status</span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(memoryData.data.overview.status)}`}
                      >
                        {memoryData.data.overview.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Heap Usage</span>
                      <span className="text-lg font-bold">
                        {memoryData.data.overview.heapUsage}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Efficiency</span>
                      <span className="text-lg font-bold text-green-600">
                        {memoryData.data.overview.efficiency}
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <Button
                        onClick={handleMemoryCleanup}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <Database className="w-4 h-4 mr-2" />
                        Run Memory Cleanup
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity and Monitoring Systems */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest system activity and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Phase 4 rollout completed successfully
                      </p>
                      <p className="text-xs text-muted-foreground">
                        2 hours ago
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Legacy system safely archived
                      </p>
                      <p className="text-xs text-muted-foreground">
                        5 hours ago
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-purple-500 rounded-full" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Memory cleanup performed
                      </p>
                      <p className="text-xs text-muted-foreground">1 day ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Monitoring Features */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Eye className="w-5 h-5 mr-2" />
                  Monitoring Systems
                </CardTitle>
                <CardDescription>
                  Active monitoring and alerting systems status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {adminData?.data?.monitoring &&
                    Object.entries(adminData.data.monitoring).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        >
                          <span className="text-sm font-medium capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <div
                            className={`w-3 h-3 rounded-full ${value ? 'bg-green-500' : 'bg-red-500'}`}
                          />
                        </div>
                      ),
                    )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* System Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="w-5 h-5 mr-2" />
                System Information
              </CardTitle>
              <CardDescription>
                Current system configuration and status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h4 className="font-medium text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Implementation
                  </h4>
                  <p className="text-lg font-semibold">
                    {adminData?.data?.systemHealth?.implementation ||
                      '100% modern'}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Legacy System
                  </h4>
                  <p className="text-lg font-semibold">
                    {adminData?.data?.systemHealth?.legacySystem ||
                      'safely archived'}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Emergency Rollback
                  </h4>
                  <p className="text-lg font-semibold text-green-600">
                    {adminData?.data?.systemHealth?.emergencyRollback ||
                      'available'}
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t">
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
                  <span>Auto-refresh: Every 30 seconds</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
