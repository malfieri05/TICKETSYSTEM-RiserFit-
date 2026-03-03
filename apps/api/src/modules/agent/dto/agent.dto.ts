import { IsString, IsOptional, MaxLength, IsNotEmpty, IsBoolean } from 'class-validator';

export class AgentChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsBoolean()
  allowWebSearch?: boolean;
}

export class AgentConfirmDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  messageId: string;
}
