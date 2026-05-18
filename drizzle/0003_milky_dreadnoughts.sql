CREATE TABLE `otp_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`code` varchar(6) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`isUsed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `otp_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `issues` ADD `riskLevel` enum('low','medium','high','critical') DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE `issues` ADD `isHidden` int DEFAULT 0 NOT NULL;