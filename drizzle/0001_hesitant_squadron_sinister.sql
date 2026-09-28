CREATE TABLE `cnpj_establishments` (
	`cnpj` text PRIMARY KEY NOT NULL,
	`cnpj_basico` text NOT NULL,
	`razao_social` text DEFAULT '' NOT NULL,
	`nome_fantasia` text DEFAULT '' NOT NULL,
	`situacao` text NOT NULL,
	`cnae_principal` text NOT NULL,
	`cnaes_secundarios` text DEFAULT '' NOT NULL,
	`cnae_descricao` text DEFAULT '' NOT NULL,
	`tipo_logradouro` text DEFAULT '' NOT NULL,
	`logradouro` text DEFAULT '' NOT NULL,
	`numero` text DEFAULT '' NOT NULL,
	`municipio` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cnpj_establishments_municipio` ON `cnpj_establishments` (`municipio`);--> statement-breakpoint
CREATE INDEX `cnpj_establishments_basico` ON `cnpj_establishments` (`cnpj_basico`);--> statement-breakpoint
ALTER TABLE `places` ADD `cnpj` text;--> statement-breakpoint
ALTER TABLE `places` ADD `cnpj_razao` text;--> statement-breakpoint
ALTER TABLE `places` ADD `cnpj_situacao` text;--> statement-breakpoint
ALTER TABLE `places` ADD `cnpj_cnae` text;--> statement-breakpoint
ALTER TABLE `places` ADD `cnpj_cnae_descricao` text;--> statement-breakpoint
ALTER TABLE `places` ADD `cnae_match` text;--> statement-breakpoint
ALTER TABLE `places` ADD `cnpj_assertiveness` integer;--> statement-breakpoint
ALTER TABLE `places` ADD `cnpj_status` text;--> statement-breakpoint
ALTER TABLE `places` ADD `cnpj_checked_at` integer;