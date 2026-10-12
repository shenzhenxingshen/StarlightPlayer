import { NativeModules } from 'react-native';

interface DiagnosticExporterModule {
  shareTextFile(content: string): Promise<string>;
}

const nativeExporter = NativeModules.DiagnosticExporter as DiagnosticExporterModule | undefined;

export async function exportDiagnosticFile(content: string): Promise<string> {
  if (!nativeExporter?.shareTextFile) {
    throw new Error('当前安装包未包含诊断文件导出模块');
  }
  return nativeExporter.shareTextFile(content);
}
