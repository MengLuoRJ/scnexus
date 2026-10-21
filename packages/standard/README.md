# SCNexus Standard

## ESM-only（破坏性变更）

本包仅分发 ES module（ESM），不再提供 CommonJS 构建或 `require` 导出。
消费者需使用 ESM `import`；CommonJS 代码可以使用异步 `import()`，不能继续使用
`require('@scnexus/standard/package')` 或 `require('@scnexus/standard/metadata')`。

公开子路径保持不变：

```ts
import { isPackage } from '@scnexus/standard/package'
import type { Metadata } from '@scnexus/standard/metadata'
```

包通过 `"type": "module"` 将 `dist/**/*.js` 标记为 ESM，并提供对应的 `.d.ts`
声明。`exports` 与 `typesVersions` 均指向这些文件；不提供包根入口或旧版
`.mjs` / `.d.mts` / CommonJS 文件的兼容路径。请勿直接依赖 `dist` 内部路径。

## 验证

在仓库根目录运行：

```sh
pnpm run build:standard
node --test scripts/__tests__/standard-distribution.test.mjs
pnpm --filter @scnexus/standard exec tsc --noEmit -p tsconfig.json
```

构建会先清理 `dist`，移除历史双格式产物；分发测试检查产物清单、声明解析、
两个子路径的 ESM 导入及 CommonJS `require` 被拒绝。此独立测试需在构建后运行。
