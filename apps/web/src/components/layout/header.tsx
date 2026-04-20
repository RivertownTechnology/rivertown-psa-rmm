import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Sun, Moon, Menu, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
  onNavigate: (path: string) => void;
  onMenuToggle: () => void;
}

export function Header({ title, onNavigate, onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();

  const initials = user?.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??';

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  }

  return (
    <header className="h-14 border-b bg-card px-3 sm:px-6 flex items-center justify-between sticky top-0 z-10 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden" onClick={onMenuToggle}>
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold truncate">{title}</h2>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Command palette search hint */}
        <button
          onClick={openCommandPalette}
          className="hidden sm:flex items-center text-muted-foreground text-sm border rounded-md px-3 py-1 hover:bg-accent transition-colors"
        >
          Search... <kbd className="ml-2 text-xs opacity-60">{'\u2318'}K</kbd>
        </button>

        {/* Dark/Light toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        >
          {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 outline-none">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden sm:inline">{user?.displayName}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <div className="text-sm font-medium">{user?.displayName}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onNavigate('/account')}>
              <User className="mr-2 h-4 w-4" />
              My Account
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate('/settings')}>
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
