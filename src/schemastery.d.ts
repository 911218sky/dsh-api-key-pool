declare module '@deepseek-ai/schemastery' {
  interface SchemasteryApi {
    object: (shape: Record<string, never>) => unknown
  }

  const schemastery: SchemasteryApi & { default?: SchemasteryApi }
  export default schemastery
}
