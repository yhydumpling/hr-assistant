-- All names, emails and experience below are fictional demo data.
-- Seed only through the explicit init script; runtime APIs never refill data.
INSERT INTO jobs(id,title,required_skills,description) VALUES
  ('job_frontend','前端工程师','["React","TypeScript"]'::jsonb,'开发招聘工作台与交互界面。'),
  ('job_ai','AI应用工程师','["Python","FastAPI","Agent"]'::jsonb,'开发可解释、可交付的 AI 应用。'),
  ('job_product','产品经理','["需求分析","项目管理"]'::jsonb,'梳理招聘需求并推进产品交付。')
ON CONFLICT DO NOTHING;

INSERT INTO candidates(id,job_id,fields_json,stage,next_action,next_action_at,source_name,raw_text) VALUES
  ('candidate_lin','job_frontend',
   '{"name":"林书妍","phone":"","email":"lin.demo@example.com","city":"北京","education":"本科（虚构）","currentTitle":"前端工程师","yearsOfExperience":3,"skills":["React","TypeScript"]}'::jsonb,
   '待复试','参加复试',(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + 1) + TIME '10:00') AT TIME ZONE 'Asia/Shanghai',
   '虚构演示资料','虚构演示候选人：林书妍。所有经历均为演示信息。'),
  ('candidate_chen','job_ai',
   '{"name":"陈亦安","phone":"","email":"chen.demo@example.com","city":"北京","education":"硕士（虚构）","currentTitle":"AI应用工程师","yearsOfExperience":1,"skills":["Python","FastAPI","Agent"]}'::jsonb,
   '简历筛选','核对项目经历',(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date) + TIME '17:00') AT TIME ZONE 'Asia/Shanghai',
   '虚构演示资料','虚构演示候选人：陈亦安。所有经历均为演示信息。'),
  ('candidate_zhou','job_product',
   '{"name":"周可欣","phone":"","email":"zhou.demo@example.com","city":"上海","education":"本科（虚构）","currentTitle":"产品经理","yearsOfExperience":4,"skills":["需求分析","项目管理"]}'::jsonb,
   '待一面','参加一面',(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + 1) + TIME '15:00') AT TIME ZONE 'Asia/Shanghai',
   '虚构演示资料','虚构演示候选人：周可欣。所有经历均为演示信息。')
ON CONFLICT DO NOTHING;

INSERT INTO interviews(id,candidate_id,round,date,time,interviewer,location) VALUES
  ('interview_demo_lin','candidate_lin','复试',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + 1,TIME '10:00','HR（演示）','待确定'),
  ('interview_demo_zhou','candidate_zhou','一面',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + 1,TIME '15:00','HR（演示）','待确定')
ON CONFLICT DO NOTHING;

INSERT INTO activities(id,candidate_id,title,detail) VALUES
  ('activity_demo_lin','candidate_lin','初始化虚构演示资料','林书妍 · 此档案不对应真实个人。'),
  ('activity_demo_chen','candidate_chen','初始化虚构演示资料','陈亦安 · 此档案不对应真实个人。'),
  ('activity_demo_zhou','candidate_zhou','初始化虚构演示资料','周可欣 · 此档案不对应真实个人。')
ON CONFLICT DO NOTHING;
