// NetScope — بازنشانی پروژه به حالت اولیه

import { db } from "@/lib/db";
import { getProject, seedChecklist } from "./engine";

export async function reseedProject() {
  const project = await getProject();

  // حذف کامل داده‌های وابسته به پروژه (به جز پروژه و چک‌لیست که بازسازی می‌شوند)
  await db.evidence.deleteMany({ where: { projectId: project.id } });
  await db.metric.deleteMany({});
  await db.alert.deleteMany({ where: { projectId: project.id } });
  await db.analysisFinding.deleteMany({ where: { projectId: project.id } });
  await db.auditLog.deleteMany({ where: { projectId: project.id } });
  await db.changeEvent.deleteMany({ where: { projectId: project.id } });
  await db.collectionAttempt.deleteMany({ where: { projectId: project.id } });
  await db.manualAnnotation.deleteMany({ where: { projectId: project.id } });
  await db.link.deleteMany({ where: { projectId: project.id } });
  await db.recorderChannel.deleteMany({});
  await db.camera.deleteMany({});
  await db.recorder.deleteMany({});
  await db.iPAssignment.deleteMany({});
  await db.interface.deleteMany({});
  await db.observation.deleteMany({});
  await db.device.deleteMany({ where: { projectId: project.id } });
  await db.network.deleteMany({ where: { projectId: project.id } });
  await db.agent.deleteMany({ where: { projectId: project.id } });
  await db.credentialReference.deleteMany({ where: { projectId: project.id } });

  // بازنشانی چک‌لیست
  await db.checklistItem.deleteMany({ where: { projectId: project.id } });
  await db.networkProject.update({
    where: { id: project.id },
    data: {
      scope: "[]",
      settings: JSON.stringify({
        engine: {
          completedSteps: [], scopeApproved: false, approvedScopes: [],
          autoMode: false, emergencyStop: false, monitoringEnabled: false,
          aiConsent: false, discoveryConfirmed: false, tickCount: 0,
        },
      }),
    },
  });

  await db.auditLog.create({
    data: { projectId: project.id, action: "بازنشانی کامل پروژه", detail: "همه داده‌های جمع‌آوری‌شده پاک شد" },
  });
  // بازسازی چک‌لیست از تعاریف ۱۴ گروه
  await seedChecklist(project.id);
  return { ok: true };
}
