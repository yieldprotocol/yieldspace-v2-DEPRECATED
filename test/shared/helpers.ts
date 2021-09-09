export const DEBUG: boolean =
  (process.env.DEBUG == undefined ? 'false' : process.env.DEBUG).toLowerCase() == 'true' ? true : false

export const debugLog: (str?: string) => Promise<void> = async (str = '\n') => {
  DEBUG && console.log(str)
}
