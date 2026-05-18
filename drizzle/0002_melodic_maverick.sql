CREATE TABLE `user_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`issueId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_votes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_votes` ADD CONSTRAINT `user_votes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_votes` ADD CONSTRAINT `user_votes_issueId_issues_id_fk` FOREIGN KEY (`issueId`) REFERENCES `issues`(`id`) ON DELETE cascade ON UPDATE no action;