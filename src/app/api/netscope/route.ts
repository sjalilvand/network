// NetScope — API وضعیت کلی (bootstrap)

import { db } from "@/lib/db";
import { getProject, getEngineState, recommendNextActions } from "@/lib/netscope/engine";
import { getChecklistView, json } from "@/lib/netscope/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const project = await getProject();
  const state = await getEngineState();
  const checklist = await getChecklistView();
  const actions = await recommendNextActions();

  const [deviceCount, networkCount, linkCount, evidenceCount, alertCount, activeAlerts, agentCount, findingCount] = await Promise.all([
    db.device.count({ where: { projectId: project.id } }),
    db.network.count({ where: { projectId: project.id } }),
    db.link.count({ where: { projectId: project.id } }),
    db.evidence.count({ where: { projectId: project.id } }),
    db.alert.count({ where: { projectId: project.id, status: "active" } }),
    db.alert.findMany({ where: { projectId: project.id, status: "active" }, orderBy: { lastSeen: "desc" }, take: 5 }),
    db.agent.count({ where: { projectId: project.id } }),
    db.analysisFinding.count({ where: { projectId: project.id } }),
  ]);

  const devices = await db.device.findMany({ where: { projectId: project.id } });
  const online = devices.filter((d) => d.status === "online" && !d.mergedIntoId).length;
  const offline = devices.filter((d) => d.status === "offline" && !d.mergedIntoId).length;

  return json({
    project: {
      id: project.id, name: project.name, description: project.description,
      scope: JSON.parse(project.scope || "[]"),
    },
    engine: state,
    checklist: { overall: checklist.overall, groups: checklist.groups },
    actions: actions.slice(0, 8),
    stats: {
      devices: deviceCount, online, offline,
      networks: networkCount, links: linkCount, evidence: evidenceCount,
      alerts: alertCount, agents: agentCount, findings: findingCount,
    },
    recentAlerts: activeAlerts.map((a) => ({
      id: a.id, title: a.title, severity: a.severity, kind: a.kind, failures: a.failures,
      lastSeen: a.lastSeen, evidence: a.evidenceText,
    })),
  });
}
