import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import accountsRouter from "./accounts";
import dailyStatsRouter from "./daily-stats";
import rechargeOrdersRouter from "./recharge-orders";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(accountsRouter);
router.use(dailyStatsRouter);
router.use(rechargeOrdersRouter);
router.use(dashboardRouter);

export default router;
