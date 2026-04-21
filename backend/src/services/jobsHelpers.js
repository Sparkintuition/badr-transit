const { MILESTONE_TEMPLATES } = require('../constants/milestones');

function createMilestonesForJob(db, jobId, jobType) {
  const template = MILESTONE_TEMPLATES[jobType];
  if (!template) throw new Error(`Unknown job type: ${jobType}`);

  const insert = db.prepare(`
    INSERT INTO job_milestones (job_id, stage_code, stage_label, display_order)
    VALUES (?, ?, ?, ?)
  `);

  for (const m of template) {
    insert.run(jobId, m.code, m.label, m.order);
  }
}

module.exports = { createMilestonesForJob };
