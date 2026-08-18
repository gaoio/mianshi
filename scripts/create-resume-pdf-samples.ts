import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResumePdf } from '../src/lib/resumePdfDocument';
import type { GeneratedResume, ResumeTemplate } from '../src/lib/types';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fontPath = `${root}/src/assets/fonts/NotoSansSC-Regular.subset.ttf`;
const outputDirectory = `${root}/output/pdf`;
const qaDirectory = `${root}/tmp/pdfs`;

const resume: GeneratedResume = {
  personal: {
    name: '张明远',
    headline: '高级 Go 后端工程师',
    phone: '138 0000 0000',
    email: 'mingyuan.zhang@example.com',
    location: '上海',
    website: 'github.com/mingyuan-zhang',
  },
  summary: '五年互联网后端研发经验，专注高并发交易系统、微服务治理与工程效率建设。具备从需求拆解、架构设计到上线运维的完整交付经验，重视可观测性、故障演练与长期可维护性。',
  skills: [
    { category: '编程语言', items: ['Go', 'Java', 'SQL', 'Shell'] },
    { category: '数据存储', items: ['MySQL', 'Redis', 'Elasticsearch'] },
    { category: '中间件', items: ['Kafka', 'RocketMQ', 'Nginx'] },
    { category: '工程实践', items: ['微服务', 'DDD', '可观测性', 'CI/CD'] },
  ],
  experience: [
    {
      company: '星河科技有限公司',
      role: '高级后端工程师',
      startDate: '2022.06',
      endDate: '至今',
      highlights: [
        '负责订单与履约域核心服务设计和迭代，建立统一状态机、幂等控制和异常补偿机制。',
        '推动链路追踪、业务指标与分级告警落地，形成从发现、定位到复盘的稳定性闭环。',
        '主导公共组件治理与代码规范建设，减少重复实现并提升跨团队协作效率。',
      ],
    },
    {
      company: '云帆网络有限公司',
      role: '后端开发工程师',
      startDate: '2020.07',
      endDate: '2022.05',
      highlights: [
        '参与营销活动平台开发，负责规则计算、库存扣减和异步任务链路。',
        '梳理慢查询和热点缓存问题，完善索引、缓存更新与容量评估流程。',
      ],
    },
  ],
  projects: [
    {
      name: '全渠道订单履约平台',
      role: '核心开发',
      startDate: '2023.01',
      endDate: '2025.06',
      summary: '连接多个交易渠道、仓储和配送系统的订单履约中台，统一承接订单生命周期管理。',
      highlights: [
        '采用事件驱动方式解耦订单、库存和履约流程，并通过事务消息与对账任务保障最终一致性。',
        '设计分层限流、热点隔离和降级策略，提升大促期间核心链路的可用性。',
      ],
      technologies: ['Go', 'MySQL', 'Redis', 'Kafka', 'OpenTelemetry'],
    },
    {
      name: '研发效能与质量平台',
      role: '技术负责人',
      startDate: '2024.03',
      endDate: '2024.12',
      summary: '整合代码检查、测试覆盖率、发布审批和线上质量数据的内部工具。',
      highlights: ['设计统一质量门禁与发布报告，帮助团队提前发现高风险变更。'],
      technologies: ['Go', 'React', 'PostgreSQL', 'Docker'],
    },
  ],
  education: [{
    school: '华东示例大学',
    degree: '本科',
    major: '计算机科学与技术',
    startDate: '2016.09',
    endDate: '2020.06',
    highlights: ['主修数据结构、操作系统、计算机网络与数据库系统。'],
  }],
};

await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(qaDirectory, { recursive: true }),
]);
const fontBytes = new Uint8Array(await readFile(fontPath));
const templates: ResumeTemplate[] = ['classic', 'modern', 'minimal'];

for (const template of templates) {
  const bytes = await buildResumePdf(resume, template, fontBytes, {
    generatedAt: new Date('2026-08-18T08:00:00.000Z'),
  });
  const path = template === 'classic'
    ? `${outputDirectory}/resume-generator-sample.pdf`
    : `${qaDirectory}/resume-${template}-qa.pdf`;
  await writeFile(path, bytes);
  console.log(path);
}
