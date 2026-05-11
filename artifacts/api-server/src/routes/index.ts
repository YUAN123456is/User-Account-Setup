import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import accountsRouter from "./accounts";
import dailyStatsRouter from "./daily-stats";
import rechargeOrdersRouter from "./recharge-orders";
import dashboardRouter from "./dashboard";
import teamsRouter from "./teams";
import teamFeedbackRouter from "./team-feedback";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(accountsRouter);
router.use(dailyStatsRouter);
router.use(rechargeOrdersRouter);
router.use(dashboardRouter);
router.use(teamsRouter);
router.use(teamFeedbackRouter);
router.use(storageRouter);

export default router;
