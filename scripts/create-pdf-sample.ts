import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExperiencePdf } from '../src/lib/pdfDocument';
import type { InterviewExperience, InterviewExperienceQuestion } from '../src/lib/types';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = `${root}/output/pdf/mianshi-pdf-export-sample.pdf`;
const fontPath = `${root}/src/assets/fonts/NotoSansSC-Regular.subset.ttf`;

const experience: InterviewExperience = {
  id: 1,
  title: '资深后端开发面试复盘：Go、数据库与系统设计',
  raw_content: '',
  summary: '本题单整理了一场资深后端岗位的真实面试重点，覆盖 Go 并发调度、MySQL 索引、缓存一致性与服务稳定性。建议先口述结论，再结合原理和工程边界进行复盘。',
  model_name: '本地演示数据',
  question_count: 3,
  created_at: '2026-08-18T08:00:00.000Z',
  updated_at: '2026-08-18T08:00:00.000Z',
};

const common = {
  experience_id: 1,
  created_at: '2026-08-18T08:00:00.000Z',
};

const questions: InterviewExperienceQuestion[] = [
  {
    ...common,
    id: 1,
    position: 0,
    title: 'Go 的 G-M-P 调度模型如何工作？发生阻塞时会怎样？',
    answer: '【结论】\nGo 运行时通过 G、M、P 三类实体把大量 goroutine 多路复用到较少的系统线程上，并通过本地队列、全局队列和工作窃取平衡负载。\n【原理】\nG 表示 goroutine，M 表示操作系统线程，P 持有执行 Go 代码所需的调度上下文。当 M 因系统调用阻塞时，P 可以与其他 M 绑定继续执行可运行的 G；网络 I/O 通常由 netpoller 统一唤醒。\n【实践】\n关注 goroutine 泄漏、无界并发和阻塞调用；使用 context 控制生命周期，并通过 pprof 与 runtime 指标定位调度压力。\n【边界】\nGoroutine 很轻量，但并非零成本。大量长期阻塞或持有大对象的 goroutine 仍会消耗内存和调度资源。',
    code: 'func worker(ctx context.Context, jobs <-chan Job) {\n    for {\n        select {\n        case <-ctx.Done():\n            return\n        case job := <-jobs:\n            handle(job)\n        }\n    }\n}',
    code_language: 'go',
    difficulty: 2,
    tags: 'Go,并发,运行时',
    sources_json: JSON.stringify([{ title: 'Go Runtime Hacking Guide', url: 'https://go.dev/src/runtime/HACKING.md' }]),
  },
  {
    ...common,
    id: 2,
    position: 1,
    title: 'MySQL 联合索引为什么要遵循最左前缀？如何判断索引是否有效？',
    answer: '【结论】\n联合 B+Tree 索引按索引列从左到右排序，查询需要先确定左侧列的有序范围，才能继续利用后续列缩小扫描范围。\n【原理】\n索引 (a, b, c) 首先按 a 排序，a 相同时再按 b、c 排序。跳过 a 直接过滤 b 时，b 在整棵树上并不保持全局有序，因此通常无法完成高效定位。\n【实践】\n结合真实查询模式设计列顺序，使用 EXPLAIN ANALYZE 检查访问路径、估算行数与实际耗时，并避免只凭 key 字段判断优化效果。\n【边界】\n索引跳跃扫描等优化可能改变访问策略；是否建立索引仍要综合选择性、写入成本、覆盖查询与存储空间。',
    code: 'EXPLAIN ANALYZE\nSELECT id, status\nFROM orders\nWHERE user_id = 42\n  AND created_at >= \'2026-08-01\'\nORDER BY created_at DESC\nLIMIT 20;',
    code_language: 'sql',
    difficulty: 2,
    tags: 'MySQL,索引,SQL',
    sources_json: JSON.stringify([{ title: 'MySQL 8.4 Multiple-Column Indexes', url: 'https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html' }]),
  },
  {
    ...common,
    id: 3,
    position: 2,
    title: '缓存与数据库双写时，怎样降低数据不一致风险？',
    answer: '【结论】\n常见方案是先更新数据库，再删除缓存，并结合重试、消息队列或订阅数据库变更日志保证删除最终成功。\n【原理】\n缓存更新与数据库提交无法天然组成同一个原子事务。直接更新缓存会受到并发写入顺序影响，而删除缓存可让后续读取回源并重建较新的值。\n【实践】\n为删除动作设计幂等重试和死信告警；热点键可使用版本号、逻辑过期或请求合并，避免缓存失效瞬间击穿数据库。\n【边界】\n该方案通常提供最终一致性而非强一致性。若业务不能容忍短暂旧读，应缩小缓存范围，或在一致性边界内采用事务型存储。',
    code: '',
    code_language: 'text',
    difficulty: 3,
    tags: 'Redis,一致性,架构',
    sources_json: JSON.stringify([{ title: 'Redis Cache-Aside Pattern', url: 'https://redis.io/glossary/cache-invalidation/' }]),
  },
];

await mkdir(`${root}/output/pdf`, { recursive: true });
const fontBytes = new Uint8Array(await readFile(fontPath));
const pdfBytes = await buildExperiencePdf(experience, questions, fontBytes, {
  generatedAt: new Date('2026-08-18T08:00:00.000Z'),
});
await writeFile(outputPath, pdfBytes);
console.log(outputPath);
