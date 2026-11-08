import { createTRPCRouter } from "../init";
import { teachersRouter } from "./teachers";
import { subjectsRouter } from "./subjects";
import { homeGroupsRouter } from "./homeGroups";
import { studentsRouter } from "./students";
import { bandsRouter } from "./bands";
import { roomsRouter } from "./rooms";
import { lessonsRouter } from "./lessons";
import { rulesRouter } from "./rules";
import { statsRouter } from "./stats";
import { dataRouter } from "./data";
import { timetablesRouter } from "./timetables";

export const appRouter = createTRPCRouter({
  teachers: teachersRouter,
  subjects: subjectsRouter,
  homeGroups: homeGroupsRouter,
  students: studentsRouter,
  bands: bandsRouter,
  rooms: roomsRouter,
  lessons: lessonsRouter,
  rules: rulesRouter,
  stats: statsRouter,
  data: dataRouter,
  timetables: timetablesRouter,
});

export type AppRouter = typeof appRouter;
