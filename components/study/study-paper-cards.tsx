"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudyPaperCard } from "@/lib/study/types";
import { cn } from "@/lib/utils";

type StudyPaperCardsProps = {
  papers: StudyPaperCard[];
  onView: (paper: StudyPaperCard) => void;
  onAsk: (paper: StudyPaperCard) => void;
  onQuiz: (paper: StudyPaperCard) => void;
  activePaperId?: string | null;
  isQuizActive?: boolean;
};

export function StudyPaperCards({
  papers,
  onView,
  onAsk,
  onQuiz,
  activePaperId = null,
  isQuizActive = false,
}: StudyPaperCardsProps) {
  return (
    <div className="flex flex-col gap-3" data-study-papers-list="true">
      {papers.map((paper) => {
        const isAskSelected = activePaperId === paper.id && !isQuizActive;
        const isQuizSelected = activePaperId === paper.id && isQuizActive;
        return (
          <Card
            className="border-border/60"
            data-study-paper-card-id={paper.id}
            key={paper.id}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{paper.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <div>
                {paper.exam} / {paper.role} / {paper.year}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs">
                  {paper.language}
                </span>
                {paper.tags.map((tag) => (
                  <span
                    className="rounded-full border border-border/60 px-2 py-0.5 text-xs"
                    key={`${paper.id}-${tag}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button
                className="cursor-pointer"
                onClick={() => onView(paper)}
                size="sm"
                type="button"
                variant="outline"
              >
                View
              </Button>
              <Button
                aria-pressed={isAskSelected}
                className={cn("cursor-pointer", isAskSelected && "shadow-sm")}
                onClick={() => onAsk(paper)}
                size="sm"
                type="button"
                variant={isAskSelected ? "default" : "outline"}
              >
                {isAskSelected ? "Asking" : "Ask"}
              </Button>
              <Button
                aria-pressed={isQuizSelected}
                className={cn("cursor-pointer", isQuizSelected && "shadow-sm")}
                onClick={() => onQuiz(paper)}
                size="sm"
                type="button"
                variant={isQuizSelected ? "default" : "outline"}
              >
                {isQuizSelected ? "Quiz active" : "Start quiz"}
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
