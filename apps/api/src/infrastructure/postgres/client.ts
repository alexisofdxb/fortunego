import { PrismaClient } from "@prisma/client";
import "../../shared/config";

export const prisma = new PrismaClient();
