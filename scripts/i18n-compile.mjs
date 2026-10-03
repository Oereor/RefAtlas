import { compile } from '@inlang/paraglide-js'
import { paraglideOptions, requirePlugin } from '../i18n.config.ts'
import { preparePlugin } from './i18n-prepare.mjs'

const offline = process.argv[2] === '--offline'
if (process.argv.slice(2).some((arg) => arg !== '--offline'))
  throw new Error('仅支持可选 --offline 参数')
if (offline) requirePlugin()
else await preparePlugin()
let networkAttempts = 0
let localModuleProbes = 0
if (offline)
  globalThis.fetch = async (input) => {
    const value = input instanceof Request ? input.url : String(input)
    if (URL.canParse(value)) networkAttempts += 1
    else localModuleProbes += 1
    throw new Error('离线编译禁止网络请求')
  }
await compile(paraglideOptions)
if (networkAttempts) throw new Error('i18n 离线编译曾尝试联网')
console.log(
  'i18n 编译完成' +
    (offline ? '；网络请求为 0；SDK 无效相对模块 fetch 探测 ' + localModuleProbes : ''),
)
