CREATE TABLE `issue_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`issueId` int NOT NULL,
	`imageUrl` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `issue_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`category` varchar(64) NOT NULL,
	`status` enum('open','in-progress','resolved') NOT NULL DEFAULT 'open',
	`severity` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`address` varchar(255) NOT NULL,
	`latitude` varchar(64) NOT NULL,
	`longitude` varchar(64) NOT NULL,
	`upvotes` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `issue_images` ADD CONSTRAINT `issue_images_issueId_issues_id_fk` FOREIGN KEY (`issueId`) REFERENCES `issues`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `issues` ADD CONSTRAINT `issues_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;