import { useState } from 'react';
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
import { LogOut, User, Sun, Moon, Palette, Search, Menu, Settings as SettingsIcon, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
  onNavigate: (path: string) => void;
  onMenuToggle: () => void;
}

const colorOptions = [
  { value: 'blue' as const, label: 'Blue', class: 'bg-blue-500' },
  { value: 'red' as const, label: 'Red', class: 'bg-red-500' },
  { value: 'green' as const, label: 'Green', class: 'bg-green-500' },
  { value: 'orange' as const, label: 'Orange', class: 'bg-orange-500' },
];

export function Header({ title, onNavigate, onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();
  const { mode, color, setMode, setColor } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const initials = user?.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '??';

  return (
    <header className="h-14 border-b bg-card px-3 sm:px-6 flex items-center justify-between sticky top-0 z-10 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 lg:hidden" onClick={onMenuToggle}>
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold truncate">{title}</h2>
      </div>

      <div className="relative hidden sm:block w-48 md:w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search..."
          className="w-full h-8 pl-9 pr-3 rounded-md border border-input bg-background text-sm"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) { onNavigate(`/search?q=${encodeURIComponent(searchQuery)}`); setSearchQuery(''); } }}
        />
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Mobile search button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden">
              <Search className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-2">
            <input
              type="text"
              placeholder="Search customers, tickets..."
              className="w-full h-8 px-3 rounded-md border border-input bg-background text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) { onNavigate(`/search?q=${encodeURIComponent(searchQuery)}`); setSearchQuery(''); } }}
              autoFocus
            />
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme color picker */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex">
              <Palette className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Theme Color</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {colorOptions.map(opt => (
              <DropdownMenuItem key={opt.value} onClick={() => setColor(opt.value)}>
                <div className={`h-3 w-3 rounded-full mr-2 ${opt.class}`} />
                {opt.label}
                {color === opt.value && <span className="ml-auto text-xs text-muted-foreground">Active</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dark/Light toggle */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
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
            {user?.isSuperAdmin && (
              <DropdownMenuItem onClick={() => onNavigate('/admin')}>
                <Shield className="mr-2 h-4 w-4" />
                ForgePSA Admin
              </DropdownMenuItem>
            )}
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
