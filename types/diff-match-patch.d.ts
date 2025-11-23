declare module "diff-match-patch" {
  export class diff_match_patch {
    diff_main(text1: string, text2: string): Array<[number, string]>;
    diff_cleanupSemantic(diffs: Array<[number, string]>): void;
    diff_toDelta(diffs: Array<[number, string]>): string;
  }
}
