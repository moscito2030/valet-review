declare const __APP_COMMIT__: string;
declare const __APP_COMMIT_MESSAGE__: string;
declare const __APP_DEPLOYED__: boolean;

export function AppVersion() {
  return __APP_COMMIT__ ? (
    <a className="app-version" href={`https://github.com/moscito2030/valet-review/commit/${__APP_COMMIT__}`}
      target="_blank" rel="noopener noreferrer"
      title={`${__APP_COMMIT__}${__APP_COMMIT_MESSAGE__ ? ` · ${__APP_COMMIT_MESSAGE__}` : ''}`}
      aria-label={`目前版本 ${__APP_COMMIT__}，查看 commit 詳情`}>
      Valet Review · {__APP_COMMIT__.slice(0, 7)}
    </a>
  ) : <span className="app-version">Valet Review · {__APP_DEPLOYED__ ? '版本資訊未提供' : '本機開發版'}</span>;
}
