import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useAuditStore, type AuditEntry } from '../store/auditStore';
import { ShieldCheck, ArrowLeft, RefreshCw, Activity, Users, Radio, EyeOff } from 'lucide-react';

interface Props { onBack: () => void; }

interface GraphNode extends d3.SimulationNodeDatum { id: string; label: string; type: 'actor' | 'channel'; }
interface GraphLink extends d3.SimulationLinkDatum<GraphNode> { action: string; }

function buildGraph(entries: AuditEntry[]) {
  const nodeMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  for (const e of entries) {
    const aId = `a:${e.actorHash.slice(0, 8)}`;
    const cId = `c:${e.channelHash.slice(0, 8)}`;
    if (!nodeMap.has(aId)) nodeMap.set(aId, { id: aId, label: e.actorHash.slice(0, 8), type: 'actor' });
    if (!nodeMap.has(cId)) nodeMap.set(cId, { id: cId, label: e.channelHash.slice(0, 8), type: 'channel' });
    links.push({ source: aId, target: cId, action: e.action });
  }
  return { nodes: Array.from(nodeMap.values()), links };
}

const ACTION_COLOR: Record<string, string> = {
  text_message: '#10b981', // emerald-500
  image_message: '#3b82f6', // blue-500
  voice_message: '#8b5cf6', // violet-500
  message: '#71717a',       // zinc-500
};

export default function Dashboard({ onBack }: Props) {
  const { entries } = useAuditStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const [serverEntries, setServerEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchServerLogs() {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3002/api/audit');
      const data = await res.json() as Array<{ actor_hash: string; action: string; channel_hash: string; fuzzy_ts: number; commitment: string }>;
      setServerEntries(data.map(d => ({ actorHash: d.actor_hash, action: d.action, channelHash: d.channel_hash ?? '', fuzzyTs: d.fuzzy_ts, commitment: d.commitment ?? '' })));
    } catch { /* offline */ }
    setLoading(false);
  }

  const allEntries = [...entries, ...serverEntries];
  const { nodes, links } = buildGraph(allEntries);

  useEffect(() => {
    if (!svgRef.current) return;
    const el = svgRef.current;
    const W = el.clientWidth || 700;
    const H = el.clientHeight || 340;
    d3.select(el).selectAll('*').remove();

    if (nodes.length === 0) return;

    const svg = d3.select(el).attr('viewBox', `0 0 ${W} ${H}`);

    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(W / 2, H / 2));

    const link = svg.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', d => ACTION_COLOR[d.action] ?? '#3f3f46')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.4);

    const node = svg.append('g').selectAll<SVGCircleElement, GraphNode>('circle').data(nodes).join('circle')
      .attr('r', d => d.type === 'actor' ? 8 : 6)
      .attr('fill', d => d.type === 'actor' ? '#10b981' : '#3b82f6')
      .attr('stroke', 'var(--bg-card)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    const label = svg.append('g').selectAll('text').data(nodes).join('text')
      .text(d => d.label)
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-size', 10)
      .attr('fill', 'var(--text-secondary)')
      .attr('text-anchor', 'middle')
      .attr('dy', -12);

    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x ?? 0).attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => (d.target as GraphNode).x ?? 0).attr('y2', d => (d.target as GraphNode).y ?? 0);
      node.attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0);
      label.attr('x', d => d.x ?? 0).attr('y', d => d.y ?? 0);
    });

    return () => { sim.stop(); };
  }, [nodes.length, links.length]);

  const totalEvents = allEntries.length;
  const uniqueActors = new Set(allEntries.map(e => e.actorHash)).size;
  const activeChannels = new Set(allEntries.map(e => e.channelHash)).size;

  return (
    <div className="dashboard-page">
      <div className="dashboard-shell">
        {/* Header */}
        <div className="dashboard-header">
          <div className="dashboard-titlebar">
            <button onClick={onBack} className="dashboard-back" aria-label="Back to chat">
              <ArrowLeft />
            </button>
            <div>
              <h1 className="dashboard-heading">Audit Dashboard</h1>
              <p className="dashboard-subtitle">Privacy-preserving event log</p>
            </div>
          </div>
          <button onClick={fetchServerLogs} disabled={loading} className="app-button">
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Sync Relay Logs
          </button>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <StatCard icon={<Activity />} label="Total Events" value={totalEvents} />
          <StatCard icon={<Users />} label="Unique Actors" value={uniqueActors} />
          <StatCard icon={<Radio />} label="Active Channels" value={activeChannels} />
          <StatCard icon={<EyeOff />} label="Exposed Content" value="0 B" />
        </div>

        <div className="dashboard-grid">
          {/* Graph */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <h2 className="dashboard-card-title">Network Graph</h2>
            </div>
            {nodes.length === 0 ? (
              <div className="graph-body">
                No activity recorded.
              </div>
            ) : (
              <div className="graph-body"><svg ref={svgRef} /></div>
            )}
          </div>

          {/* Event Log */}
          <div className="dashboard-card activity-panel">
             <div className="dashboard-card-header">
              <h2 className="dashboard-card-title">Recent Activity</h2>
            </div>
            <div className="activity-list">
              {allEntries.length === 0 ? (
                 <div className="empty-line">Log is empty.</div>
              ) : (
                allEntries.slice(-30).reverse().map((e, i) => (
                  <div key={i} className="activity-row">
                    <div className="activity-row-top">
                      <span className="activity-kind" style={{ color: ACTION_COLOR[e.action] ?? '#71717a' }}>
                        {e.action.replace('_message', '').toUpperCase()}
                      </span>
                      <span className="activity-time">{new Date(e.fuzzyTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-mono truncate">actor:{e.actorHash.slice(0,8)} → chan:{e.channelHash.slice(0,8)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="privacy-panel">
          <h3 className="privacy-title">
            <ShieldCheck /> Privacy Guarantees
          </h3>
          <div className="privacy-grid">
             {[
                ['Cryptographic Identifiers', 'Users and channels are identified only by irreversible SHA-256 hashes.'],
                ['Content Blindness', 'The relay server processes only encrypted blobs and never stores payload content.'],
                ['Time Obfuscation', 'Timestamps are rounded to 5-minute intervals to prevent timing analysis.'],
                ['Commitment Proofs', 'Every transit is verified via HMAC-SHA256 commitments over the ciphertext, ensuring integrity.'],
              ].map(([t, desc]) => (
                <div key={t}>
                  <div className="privacy-item-title">{t}</div>
                  <div className="privacy-item-copy">{desc}</div>
                </div>
              ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) {
  return (
    <div className="stat-card">
       <div className="stat-icon">
          {icon}
       </div>
       <div>
         <div className="stat-label">{label}</div>
         <div className="stat-value">{value}</div>
       </div>
    </div>
  );
}
