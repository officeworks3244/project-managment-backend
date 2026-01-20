import express from "express";
import { getCalendarByRange } from "../controllers/calendar.controller.js";
import { requireAuth } from "../middleware/auth.js";


const router = express.Router();

router.post("/calendar", requireAuth, getCalendarByRange);


export default router;
