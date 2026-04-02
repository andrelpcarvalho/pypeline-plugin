export type BuildResult = {
  commitHash:   string;
  novoBaseline: string;
  added:        string[];
  modified:     string[];
  deleted:      string[];
};

export type PackageResult = {
  success:  boolean;
  buildDir: string;
};

export type DeployTrainingResult = {
  success: boolean;
  logPath: string;
};

export type ValidatePrdResult = {
  success: boolean;
  jobId:   string | null;
  logPath: string;
};

export type QuickdeployResult = {
  success: boolean;
  jobId:   string;
  logPath: string;
};

export type RunResult = {
  success:         boolean;
  jobId:           string | null;
  baselineUpdated: string | null;
};

export type GitDiffResult = {
  added:      string[];
  modified:   string[];
  deleted:    string[];
  notDeleted: string[];
};

// prototype deve vir antes dos métodos (member-ordering)
export type OclifCommand<T> = {
  prototype: Record<string, unknown>;
  run(args: string[]): Promise<T>;
};

export type EsmockModule<T> = {
  default: OclifCommand<T>;
};
