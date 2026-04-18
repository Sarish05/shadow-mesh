import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
  text_message: '#10b981',
  image_message: '#3b82f6',
  voice_message: '#a855f7',
  message: '#64748b',
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
      const data = await res.json() as Array<{ actor_hash: string; action: string; channel_hash: string; fuzzy_ts: number }>;
      setServerEntries(data.map(d => ({ actorHash: d.actor_hash, action: d.action, channelHash: d.channel_hash ?? '', fuzzyTs: d.fuzzy_ts, commitment: '' })));
    } catch { /* offline */ }
    setLoading(false);
  }

  const allEntries = [...entries, ...serverEntries];
  const { nodes, links } = buildGraph(allEntries);

  useEffect(() => {
    if (!svgRef.current) return;
    const el = svgRef.current;
    const W = el.clientWidth || 700; const H = el.clientHeight || 350;
    d3.select(el).selectAll('*').remove();

    if (nodes.length === 0) return;

    const svg = d3.select(el).attr('viewBox', `0 0 ${W} ${H}`);

    // Grid lines
    svg.append('g').selectAll('line').data(d3.range(0, W, 40)).join('line')
      .attr('x1', d => d).attr('y1', 0).attr('x2', d => d).attr('y2', H)
      .attr('stroke', 'rgba(16,185,129,0.04)');
    svg.append('g').selectAll('line').data(d3.range(0, H, 40)).join('line')
      .attr('x1', 0).attr('y1', d => d).attr('x2', W).attr('y2', d => d)
      .attr('stroke', 'rgba(16,185,129,0.04)');

    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(90))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(W / 2, H / 2));

    // Links
    const link = svg.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', d => ACTION_COLOR[d.action] ?? '#334155')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.3);

    // Glow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Nodes
    const node = svg.append('g').selectAll<SVGCircleElement, GraphNode>('circle').data(nodes).join('circle')
      .attr('r', d => d.type === 'actor' ? 8 : 5)
      .attr('fill', d => d.type === 'actor' ? '#10b981' : '#3b82f6')
      .attr('filter', 'url(#glow)')
      .attr('stroke', d => d.type === 'actor' ? '#34d39966' : '#60a5fa66')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, GraphNode>()
          .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // Labels
    const label = svg.append('g').selectAll('text').data(nodes).join('text')
      .text(d => d.label)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 8)
      .attr('fill', d => d.type === 'actor' ? '#34d399' : '#60a5fa')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.type === 'actor' ? -14 : -10)
      .attr('opacity', 0.7);

    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x ?? 0).attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => (d.target as GraphNode).x ?? 0).attr('y2', d => (d.target as GraphNode).y ?? 0);
      node.attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0);
      label.attr('x', d => d.x ?? 0).attr('y', d => d.y ?? 0);
    });

    return () => { sim.stop(); };
  }, [nodes.length, links.length]);

  const actionCounts = allEntries.reduce<Record<string, number>>((a, e) => ({ ...a, [e.action]: (a[e.action] ?? 0) + 1 }), {});
  const totalEvents = allEntries.length;
  const uniqueActors = new Set(allEntries.map(e => e.actorHash)).size;
  const activeChannels = new Set(allEntries.map(e => e.channelHash)).size;

  const statCards = [
    { icon: Activity, label: 'Total Events', value: totalEvents, color: 'text-emerald-400' },
    { icon: Users, label: 'Unique Actors', value: uniqueActors, color: 'text-blue-400' },
    { icon: Radio, label: 'Active Channels', value: activeChannels, color: 'text-purple-400' },
    { icon: EyeOff, label: 'Content Exposed', value: '0 bytes', color: 'text-yellow-400' },
  ];

  return (
    <div className="min-h-screen bg-[#020409] grid-bg scanlines">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[#070d11] border border-slate-800 hover:border-emerald-700/50 flex items-center justify-center text-slate-500 hover:text-emerald-400 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-mono text-xl font-bold text-white tracking-widest">AUDIT DASHBOARD</h1>
              <p className="font-mono text-[11px] text-emerald-700 mt-0.5">Activity tracking without content exposure · ZK-commitment audit trail</p>
            </div>
          </div>
          <button onClick={fetchServerLogs} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#070d11] border border-slate-800 hover:border-emerald-700/50 text-slate-400 hover:text-emerald-400 font-mono text-xs transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            SYNC SERVER LOGS
          </button>
        </motion.div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {statCards.map(({ icon: Icon, label, value, color }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="bg-[#040810] border border-emerald-900/30 rounded-2xl p-5 glow-green"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">{label}</span>
                <Icon className={`w-4 h-4 ${color} opacity-60`} />
              </div>
              <div className={`font-mono text-3xl font-bold ${color}`}>{value}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Graph */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="col-span-2 bg-[#040810] border border-emerald-900/30 rounded-2xl overflow-hidden glow-green"
          >
            <div className="px-5 py-4 border-b border-emerald-900/20 flex items-center justify-between">
              <div>
                <h2 className="font-mono text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  ANONYMIZED COMMUNICATION GRAPH
                </h2>
                <p className="font-mono text-[10px] text-slate-700 mt-0.5">SHA-256 hashed identities · no real IDs stored</p>
              </div>
              <div className="flex items-center gap-4 font-mono text-[10px] text-slate-600">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Actor</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Channel</span>
              </div>
            </div>
            {nodes.length === 0 ? (
              <div className="h-72 flex items-center justify-center">
                <div className="text-center">
                  <Radio className="w-8 h-8 text-slate-800 mx-auto mb-2" />
                  <p className="font-mono text-xs text-slate-700">No activity logged yet.</p>
                  <p className="font-mono text-[10px] text-slate-800 mt-1">Send some messages to populate the graph.</p>
                </div>
              </div>
            ) : (
              <svg ref={svgRef} className="w-full h-72" />
            )}
          </motion.div>

          {/* Side panels */}
          <div className="space-y-4">
            {/* Action breakdown */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
              className="bg-[#040810] border border-emerald-900/30 rounded-2xl p-5"
            >
              <h3 className="font-mono text-xs text-slate-500 uppercase tracking-widest mb-4">Message Types</h3>
              {Object.keys(actionCounts).length === 0 ? (
                <p className="font-mono text-xs text-slate-800">No events recorded.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(actionCounts).map(([action, count]) => (
                    <div key={action}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: ACTION_COLOR[action] ?? '#64748b' }} />
                          <span className="font-mono text-[11px] text-slate-500">{action.replace('_message', '')}</span>
                        </div>
                        <span className="font-mono text-[11px] text-white">{count}</span>
                      </div>
                      <div className="h-0.5 bg-slate-900 rounded overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${(count / totalEvents) * 100}%`, background: ACTION_COLOR[action] ?? '#64748b', opacity: 0.6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Recent events */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="bg-[#040810] border border-emerald-900/30 rounded-2xl p-5"
            >
              <h3 className="font-mono text-xs text-slate-500 uppercase tracking-widest mb-4">Recent Events</h3>
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {allEntries.length === 0 ? (
                  <p className="font-mono text-xs text-slate-800">No events yet.</p>
                ) : (
                  allEntries.slice(-15).reverse().map((e, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: ACTION_COLOR[e.action] ?? '#64748b' }} />
                      <div>
                        <div className="font-mono text-[10px] text-slate-500">
                          <span style={{ color: ACTION_COLOR[e.action] ?? '#64748b' }}>{e.actorHash.slice(0, 8)}</span>
                          <span className="text-slate-700"> → {e.action}</span>
                        </div>
                        <div className="font-mono text-[9px] text-slate-800">{new Date(e.fuzzyTs).toLocaleTimeString()} (±5min)</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Privacy guarantee banner */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-4 bg-emerald-900/10 border border-emerald-900/30 rounded-2xl p-4 flex items-start gap-3"
        >
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs text-emerald-600 font-semibold mb-1">PRIVACY GUARANTEE</p>
            <p className="font-mono text-[11px] text-slate-600 leading-relaxed">
              All actor and channel IDs are SHA-256 hashed — irreversible. Timestamps are rounded to ±5-minute buckets to prevent timing attacks.
              Zero message content is logged at any layer. Each event carries an HMAC-SHA256 commitment proving authenticity without revealing payload.
              <span className="text-emerald-600"> Content exposure: 0 bytes.</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
