import React, { useState, useEffect } from 'react';
import { apiClient, tokenStorage } from "@/api/apiClient";

const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState([]);
  const [timeRange, setTimeRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const token = tokenStorage.getUserToken();

  // Fetch analytics from backend
  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const response = await apiClient.get(`/publish/analytics?days=${days}`, token);
      setAnalytics(response.analytics || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics');
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate overall metrics
  const calculateOverallMetrics = () => {
    const totalViews = analytics.reduce((sum, a) => sum + (a.metrics?.views || 0), 0);
    const totalReactions = analytics.reduce((sum, a) => sum + (a.metrics?.reactions || 0), 0);
    const totalComments = analytics.reduce((sum, a) => sum + (a.metrics?.comments || 0), 0);
    const totalBookmarks = analytics.reduce((sum, a) => sum + (a.metrics?.bookmarks || 0), 0);
    const totalPosts = analytics.length;

    return { totalViews, totalReactions, totalComments, totalBookmarks, totalPosts };
  };

  // Group analytics by platform
  const getByPlatform = () => {
    const grouped = {};
    analytics.forEach(a => {
      if (!grouped[a.platform]) {
        grouped[a.platform] = { views: 0, reactions: 0, comments: 0, bookmarks: 0, posts: 0 };
      }
      grouped[a.platform].views += a.metrics?.views || 0;
      grouped[a.platform].reactions += a.metrics?.reactions || 0;
      grouped[a.platform].comments += a.metrics?.comments || 0;
      grouped[a.platform].bookmarks += a.metrics?.bookmarks || 0;
      grouped[a.platform].posts += 1;
    });
    return grouped;
  };

  // Get top performing posts
  const getTopPosts = () => {
    return analytics
      .sort((a, b) => (b.metrics?.views || 0) - (a.metrics?.views || 0))
      .slice(0, 5);
  };

  const overall = calculateOverallMetrics();
  const byPlatform = getByPlatform();
  const topPosts = getTopPosts();

  // Platform colors
  const platformColors = {
    wordpress: '#21759B',
    hashnode: '#2962FF',
    devto: '#0A0A0A'
  };

  const platformIcons = {
    wordpress: '🔵',
    hashnode: '🔷',
    devto: '⬛'
  };

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h1>📊 Publishing Analytics</h1>
        <p>Track performance across all your published posts</p>
      </div>

      {/* Time Range Selector */}
      <div className="time-range-selector">
        <button 
          className={timeRange === '7d' ? 'active' : ''}
          onClick={() => setTimeRange('7d')}
        >
          Last 7 Days
        </button>
        <button 
          className={timeRange === '30d' ? 'active' : ''}
          onClick={() => setTimeRange('30d')}
        >
          Last 30 Days
        </button>
        <button 
          className={timeRange === '90d' ? 'active' : ''}
          onClick={() => setTimeRange('90d')}
        >
          Last 90 Days
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <p>Loading analytics...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="error-state">
          <p>⚠️ {error}</p>
          <button onClick={fetchAnalytics}>Retry</button>
        </div>
      )}

      {!loading && !error && analytics.length === 0 && (
        <div className="empty-state">
          <p>📭 No analytics data yet. Publish some posts to see metrics!</p>
        </div>
      )}

      {!loading && !error && analytics.length > 0 && (
        <>
          {/* Overall Performance Cards */}
          <div className="overall-metrics">
            <div className="metric-card">
              <div className="metric-icon">📝</div>
              <div className="metric-value">{overall.totalPosts}</div>
              <div className="metric-label">Total Posts</div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">👁</div>
              <div className="metric-value">{overall.totalViews}</div>
              <div className="metric-label">Total Views</div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">❤️</div>
              <div className="metric-value">{overall.totalReactions}</div>
              <div className="metric-label">Total Reactions</div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">💬</div>
              <div className="metric-value">{overall.totalComments}</div>
              <div className="metric-label">Total Comments</div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">📌</div>
              <div className="metric-value">{overall.totalBookmarks}</div>
              <div className="metric-label">Total Bookmarks</div>
            </div>
          </div>

          {/* Platform Breakdown */}
          <div className="platform-breakdown">
            <h2>Platform Breakdown</h2>
            <div className="platform-grid">
              {Object.entries(byPlatform).map(([platform, data]) => (
                <div className="platform-card" key={platform}>
                  <div className="platform-header">
                    <span className="platform-icon">{platformIcons[platform]}</span>
                    <span className="platform-name">{platform}</span>
                  </div>
                  <div className="platform-stats">
                    <div className="stat">
                      <span className="stat-value">{data.posts}</span>
                      <span className="stat-label">Posts</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">{data.views}</span>
                      <span className="stat-label">Views</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">{data.reactions}</span>
                      <span className="stat-label">Reactions</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">{data.comments}</span>
                      <span className="stat-label">Comments</span>
                    </div>
                    {data.bookmarks > 0 && (
                      <div className="stat">
                        <span className="stat-value">{data.bookmarks}</span>
                        <span className="stat-label">Bookmarks</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Performing Posts */}
          <div className="top-posts">
            <h2>🏆 Top Performing Posts</h2>
            <div className="posts-table">
              {topPosts.map((post, index) => (
                <div className="post-row" key={post.id || post.postId}>
                  <div className="post-rank">{index + 1}</div>
                  <div className="post-platform">
                    <span className="platform-icon">{platformIcons[post.platform]}</span>
                    <span>{post.platform}</span>
                  </div>
                  <div className="post-id">{post.postId}</div>
                  <div className="post-metrics">
                    <span className="metric">👁 {post.metrics?.views || 0}</span>
                    <span className="metric">❤️ {post.metrics?.reactions || 0}</span>
                    <span className="metric">💬 {post.metrics?.comments || 0}</span>
                    {post.metrics?.bookmarks && (
                      <span className="metric">📌 {post.metrics.bookmarks}</span>
                    )}
                  </div>
                  <div className="post-date">
                    {new Date(post.fetchedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Platform Performance Comparison */}
          <div className="platform-comparison">
            <h2>Platform Performance Comparison</h2>
            <div className="comparison-chart">
              {Object.entries(byPlatform).map(([platform, data]) => {
                const maxViews = Math.max(...Object.values(byPlatform).map(p => p.views));
                const percentage = maxViews > 0 ? (data.views / maxViews) * 100 : 0;
                
                return (
                  <div className="comparison-bar" key={platform}>
                    <div className="bar-label">
                      <span className="platform-icon">{platformIcons[platform]}</span>
                      <span>{platform}</span>
                    </div>
                    <div className="bar-container">
                      <div 
                        className="bar-fill"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: platformColors[platform]
                        }}
                      />
                    </div>
                    <div className="bar-value">{data.views} views</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Styles
const styles = `
.analytics-dashboard {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  margin-bottom: 32px;
}

.dashboard-header h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #1a1a1a;
}

.dashboard-header p {
  color: #666;
  font-size: 14px;
}

.time-range-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
}

.time-range-selector button {
  padding: 10px 20px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  font-size: 14px;
  border-radius: 6px;
  transition: all 0.2s;
}

.time-range-selector button.active {
  background: #2962FF;
  color: white;
  border-color: #2962FF;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.error-state button {
  margin-top: 12px;
  padding: 10px 24px;
  background: #2962FF;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.overall-metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.metric-card {
  background: white;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.metric-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 4px;
}

.metric-label {
  font-size: 13px;
  color: #666;
}

.platform-breakdown {
  margin-bottom: 32px;
}

.platform-breakdown h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #1a1a1a;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.platform-card {
  background: white;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 20px;
}

.platform-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
}

.platform-icon {
  font-size: 20px;
}

.platform-name {
  font-weight: 600;
  font-size: 16px;
}

.platform-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
}

.stat-label {
  font-size: 12px;
  color: #666;
}

.top-posts {
  margin-bottom: 32px;
}

.top-posts h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #1a1a1a;
}

.posts-table {
  background: white;
  border: 1px solid #eee;
  border-radius: 12px;
}

.post-row {
  display: grid;
  grid-template-columns: 50px 100px 150px 200px 150px;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.post-row:last-child {
  border-bottom: none;
}

.post-rank {
  font-size: 18px;
  font-weight: 700;
  color: #2962FF;
}

.post-platform {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.post-id {
  color: #666;
  font-size: 13px;
}

.post-metrics {
  display: flex;
  gap: 12px;
  font-size: 13px;
}

.metric {
  color: #666;
}

.post-date {
  color: #999;
  font-size: 13px;
}

.platform-comparison {
  margin-bottom: 32px;
}

.platform-comparison h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #1a1a1a;
}

.comparison-chart {
  background: white;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 24px;
}

.comparison-bar {
  display: grid;
  grid-template-columns: 120px 1fr 100px;
  gap: 16px;
  margin-bottom: 16px;
  align-items: center;
}

.bar-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.bar-container {
  height: 32px;
  background: #f5f5f5;
  border-radius: 6px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  transition: width 0.3s;
}

.bar-value {
  font-weight: 600;
  text-align: right;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

export default AnalyticsDashboard;
